let htmlMap = new WeakMap();
let tokensRegex = /(?<!\\)(<!--|-->|<[\w-]+|<\/[\w-]+>|\/>|[\'\"=>])/;
let currentCallback;
let effectQueue = [];
let effectScheduled = false;
let reads = new WeakMap();
let RENDERER = Symbol("renderer");

function immediateEffect(callback) {
	let prev = currentCallback;

	currentCallback = callback;

	callback();

	currentCallback = prev;
}

export function effect(...callbacks) {
	effectQueue.push(...callbacks);

	if (!effectScheduled) {
		effectScheduled = true;

		setTimeout(() => {
			effectScheduled = false;

			let callbacks = effectQueue.splice(0, Infinity);
			let prev = currentCallback;

			for (let cb of callbacks) {
				currentCallback = cb;

				cb();
			}

			currentCallback = prev;
		}, 0);
	}
}

export function watch(object) {
	reads.set(object, new Map());

	return new Proxy(object, {set, get});
}

function get(o, key, r) {
	if (currentCallback) {
		let callbacks = reads.get(o).get(key);

		if (!callbacks) {
			callbacks = new Set();
			reads.get(o).set(key, callbacks);
		}

		callbacks.add(currentCallback);
	}

	return Reflect.get(o, key, r);
}

function set(o, key, value, r) {
	let callbacks = reads.get(o).get(key);

	if (callbacks) {
		effect(...callbacks);

		callbacks.clear();
	}

	return Reflect.set(o, key, value, r);
}

export function html(strs, ...args) {
	let node = htmlMap.get(strs);

	if (!node) {
		node = {nodes: []};

		let stack = [node];
		let mode = 0;
		let comment = false;
		let quote;
		let attr;

		for (let token of tokenize(...strs)) {
			let {nodes, attrs} = stack[0];
			let dynamic = false;

			if (typeof token === "number") {
				dynamic = true;
			} else if (!token.trim()) {
				continue;
			}

			if (comment) {
				if (token === "-->") {
					comment = false;
				}
			} else if (mode == 0) {
				if (token === "<!--") {
					comment = true;
				} else if (token.startsWith?.("</")) {
					let item;
					let name = token.slice(2, -1);

					do {
						item = stack.shift();
					} while (item.name !== name);
				} else if (token.startsWith?.("<")) {
					mode = 1;

					stack.unshift({
						name: token.slice(1),
						attrs: [],
						nodes: [],
						root: stack.length === 1,
					});

					nodes.push(stack[0]);
				} else {
					nodes.push(token);
				}
			} else if (mode === 1) {
				if (token === ">") {
					mode = 0;
				} else if (token === "/>") {
					mode = 0;

					stack.shift();
				} else if (token === "=") {
					mode = 2;
				} else {
					for (let name of token.trim().split(/\s+/)) {
						attr = {name, value: true};

						attrs.push(attr);
					}
				}
			} else if (mode === 2) {
				if (token === "'" || token === '"') {
					attr.value = [];
					quote = token;

					mode = 3;
				} else if (dynamic) {
					attr.value = token;

					mode = 1;
				} else {
					throw Error();
				}
			} else if (token === quote) {
				mode = 1;

				quote = null;
			} else {
				attr.value.push(token);
			}
		}

		htmlMap.set(strs, node);
	}

	return {node, args};
}

function* tokenize(...strs) {
	for (let i = 0; i < strs.length; i++) {
		yield* strs[i].split(tokensRegex);

		if (i < strs.length - 1) {
			yield i;
		}
	}
}

export function render(
	{node, args},
	element,
	namespace = element.namespaceURI
) {
	let elementRef = new WeakRef(element);
	let document = element.ownerDocument;

	for (let {name, value} of node.attrs ?? []) {
		if (typeof value === "number") {
			if (name.startsWith("on")) {
				name = name.slice(2);

				element.addEventListener(name, ...[].concat(args[value]));
			} else {
				immediateEffect(() => {
					let element = elementRef.deref();

					if (!element) {
						return;
					}

					let current = callOrReturn(args[value]);

					if (element[name] !== current) {
						element[name] = current;
					}
				});
			}
		} else {
			immediateEffect(() => {
				let element = elementRef.deref();

				if (!element) {
					return;
				}

				let current = null;

				for (let v of value) {
					if (typeof v === "number") {
						v = callOrReturn(args[v]);
					}

					if (v == null) {
						continue;
					}

					current ??= "";

					current += v;
				}

				if (current !== null) {
					element.setAttribute(name, current);
				} else {
					element.removeAttribute(name);
				}
			});
		}
	}

	for (let subNode of walkNodes({node, args})) {
		if (subNode == null) continue;

		if (typeof subNode === "string") {
			element.append(subNode);
		} else if (typeof subNode === "object") {
			if (subNode[RENDERER]) {
				let start = document.createComment("");
				let end = document.createComment("");

				element.append(start, end);

				subNode[RENDERER](new WeakRef(start), new WeakRef(end), namespace);
			} else {
				let subNamespace =
					subNode.node.name === "svg"
						? "http://www.w3.org/2000/svg"
						: namespace;
				let newChild = document.createElementNS(
					subNamespace,
					subNode.node.name
				);

				element.append(newChild);

				render(subNode, newChild, subNamespace);
			}
		}
	}
}

function* walkNodes({node, args}) {
	for (let n of node.nodes) {
		if (typeof n === "number") {
			let values = [].concat(args[n]);

			for (let value of values) {
				if (value != null) {
					if (typeof value === "function") {
						yield include(value);
					} else if (value[RENDERER]) {
						yield value;
					} else if (value.node) {
						yield* walkNodes(value);
					} else {
						yield String(value);
					}
				}
			}
		} else if (n.nodes) {
			yield {node: n, args};
		} else {
			yield String(n);
		}
	}
}

function callOrReturn(value) {
	return typeof value === "function" ? value() : value;
}

function include(value) {
	return {
		[RENDERER]: (startRef, endRef, namespace) => {
			immediateEffect(() => {
				let start = startRef.deref();
				let end = endRef.deref();

				if (!start || !end) {
					return;
				}

				let currentChild = start.nextSibling;

				truncate(currentChild, end);

				let result = callOrReturn(value);

				if (result != null) {
					if (result.node) {
						let fragment = new DocumentFragment();

						render(result, fragment, namespace);

						start.after(fragment);
					} else {
						start.after(result);
					}
				}
			});
		},
	};
}

export function each(list, callback) {
	return {
		[RENDERER]: (startRef, endRef, namespace) => {
			let views = [];
			let fragment = new DocumentFragment();

			immediateEffect(() => {
				let start = startRef.deref();
				let end = endRef.deref();

				if (!start || !end) {
					return;
				}

				let i = 0;
				let currentChild = start.nextSibling;

				if (currentChild === end) {
					currentChild = null;
				}

				for (let j = 0; j < list.length; j++) {
					let item = list[j];
					let cb = callback(item, j);

					if (cb == null) {
						continue;
					}

					let view = views[i];

					if (!view) {
						view = watch({});

						views.push(view);
					}

					if (item !== view.item) {
						view.item = item;
					}

					view.index = j;

					if (!currentChild) {
						render(cb(view), fragment, namespace);
					}

					currentChild = currentChild?.nextSibling;

					if (currentChild === end) {
						currentChild = null;
					}

					i++;
				}

				end.before(fragment);

				views.splice(i, Infinity);

				truncate(currentChild, end);
			});
		},
	};
}

function truncate(currentChild, end) {
	while (currentChild) {
		if (currentChild === end) {
			break;
		}

		let nextChild = currentChild.nextSibling;

		currentChild.remove();

		currentChild = nextChild;
	}
}
