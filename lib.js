/* Reactivity */

let currentCallback;
let effectScheduled = false;
let effectQueue = new Set();
let reads = new WeakMap();

export function effect(...callbacks) {
	for (let cb of callbacks) {
		effectQueue.add(cb);
	}

	if (!effectScheduled) {
		effectScheduled = true;

		setTimeout(() => {
			effectScheduled = false;

			let callbacks = [...effectQueue.values()];

			effectQueue.clear();

			for (let cb of callbacks) {
				immediateEffect(cb);
			}
		}, 0);
	}
}

export function watch(object) {
	reads.set(object, new Map());

	return new Proxy(object, {set, get});
}

function immediateEffect(callback) {
	let prev = currentCallback;

	currentCallback = callback;

	callback();

	currentCallback = prev;
}

function mutationEffect(callback, ...refs) {
	immediateEffect(() => {
		let args = refs.map((ref) => (ref.deref ? ref.deref() : ref));

		if (args.some((arg) => arg == null)) {
			return;
		}

		callback(...args);
	});
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

/* Declarative */

let htmlMap = new WeakMap();
let tokensRegex = /(?<!\\)(<!--|-->|<[\w-]+|<\/[\w-]+>|\/>|[\'\"=>])/;

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

/* Rendering */

export function render(
	{node, args},
	element,
	namespace = "http://www.w3.org/1999/xhtml"
) {
	let elementRef = new WeakRef(element);
	let document = element.ownerDocument;

	for (let {name, value} of node.attrs ?? []) {
		if (typeof value === "number") {
			if (name.startsWith("on")) {
				name = name.slice(2);

				element.addEventListener(name, ...[].concat(args[value]));
			} else {
				mutationEffect((element) => {
					let current = callOrReturn(args[value]);

					if (element[name] !== current) {
						element[name] = current;
					}
				}, elementRef);
			}
		} else {
			mutationEffect((element) => {
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
			}, elementRef);
		}
	}

	for (let subNode of walk({node, args})) {
		if (subNode == null) continue;

		if (typeof subNode === "string") {
			element.append(subNode);
		} else if (typeof subNode === "function") {
			let start = document.createComment("");
			let end = document.createComment("");

			element.append(start, end);

			mutationEffect(subNode, new WeakRef(start), new WeakRef(end), namespace);
		} else {
			let subNamespace =
				subNode.node.name === "svg" ? "http://www.w3.org/2000/svg" : namespace;
			let newChild = document.createElementNS(subNamespace, subNode.node.name);

			element.append(newChild);

			render(subNode, newChild, subNamespace);
		}
	}
}

function* walk({node, args}) {
	for (let n of node.nodes) {
		if (typeof n === "number") {
			let values = [].concat(args[n]);

			for (let value of values) {
				if (value != null) {
					if (typeof value === "function") {
						yield value;
					} else if (value.node) {
						yield* walk(value);
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

/* Renderers */

export function each(list, callback) {
	let views = [];

	return (_, end, namespace) => {
		let index = 0;

		for (; index < list.length; index++) {
			let item = list[index];
			let view = views[index];

			if (!view) {
				let s = document.createComment("");
				let e = document.createComment("");

				end.before(s, e);

				s = new WeakRef(s);
				e = new WeakRef(e);

				let d = watch({item, index});

				let inc = include(() => {
					return callback(d);
				});

				mutationEffect(inc, s, e, namespace);

				views.push([s, d]);
			} else {
				let [_, d] = view;

				if (d.item !== item) {
					d.item = item;
				}

				if (d.index !== index) {
					d.index = index;
				}
			}
		}

		let currentChild = views[index]?.[0]?.deref();

		if (currentChild) {
			truncate(currentChild, end);
		}

		views.splice(index, Infinity);
	};
}

export function include(callback) {
	let prev = null;

	return (start, end, namespace) => {
		let currentChild = start.nextSibling;

		let current = callback();

		if (current == null && prev !== current) {
			truncate(currentChild, end);
		} else if (current?.node != null) {
			if (prev?.node === current?.node) return;

			truncate(currentChild, end);

			let fragment = new DocumentFragment();

			render(current, fragment, namespace);

			start.after(fragment);
		} else {
			if (prev === current) return;

			truncate(currentChild, end);

			start.after(current);
		}

		prev = current;
	};
}

export function text(callback) {
	let initialized = false;

	return (start) => {
		let current = String(callback() ?? "");

		if (!initialized) {
			let text = document.createTextNode(current);

			start.after(text);

			initialized = true;
		} else {
			let currentChild = start.nextSibling;

			if (currentChild.nodeValue !== current) {
				currentChild.nodeValue = current;
			}
		}
	};
}

/* Utils */

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

function callOrReturn(value) {
	return typeof value === "function" ? value() : value;
}
