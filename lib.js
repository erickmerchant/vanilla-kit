let currentCallback;
let effectScheduled = false;
let effectQueue = [];
let reads = new WeakMap();

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
		effectQueue.push(...callbacks);

		if (!effectScheduled) {
			effectScheduled = true;

			setTimeout(() => {
				effectScheduled = false;

				for (let callback of new Set(effectQueue.splice(0, Infinity))) {
					effect(callback);
				}
			}, 0);
		}

		callbacks.clear();
	}

	return Reflect.set(o, key, value, r);
}

export function effect(callback) {
	let prevCallback = currentCallback;

	currentCallback = callback;

	callback();

	currentCallback = prevCallback;
}

function mutation(callback, ...refs) {
	effect(() => {
		let derefs = refs.map((ref) => ref.deref());

		if (derefs.some((arg) => arg == null)) {
			return;
		}

		callback(...derefs);
	});
}

export function list(list, callback) {
	let views = [];
	let end = document.createComment("");
	let frag = new DocumentFragment();

	frag.append(end);

	mutation((end) => {
		for (let index = 0; index < list.length; index++) {
			let item = list[index];
			let view = views[index];

			if (!view) {
				let data = watch({item, index});
				let frag = fragment(callback, [data]);

				views.push({start: new WeakRef(frag.firstChild), data});

				end.before(frag);
			} else {
				let {data} = view;

				if (data.item !== item) {
					data.item = item;
				}

				if (data.index !== index) {
					data.index = index;
				}
			}
		}

		let currentChild = views[list.length]?.start?.deref();

		truncate(currentChild, end);

		views.splice(list.length, Infinity);
	}, ...refAll(end));

	return frag;
}

export function fragment(callback, args = []) {
	let prevResult = null;
	let [start, end] = [document.createComment(""), document.createComment("")];
	let frag = new DocumentFragment();

	frag.append(start, end);

	mutation((start, end) => {
		let currentChild = start.nextSibling;
		let currentResult = callback(...args);
		let newChild;

		if (
			(currentResult == null && prevResult == null) ||
			currentResult === prevResult
		) {
			return;
		} else if (currentResult != null) {
			let unwrappedResult =
				typeof currentResult === "function"
					? currentResult(...args)
					: currentResult;

			if (unwrappedResult != null) {
				newChild = new DocumentFragment();

				let list = [];

				for (let item of [].concat(unwrappedResult)) {
					if (item != null) {
						if (item.node != null && item.args != null) {
							item = create(item);
						}

						list.push(item);
					}
				}

				newChild.append(...list);
			}
		}

		if (currentChild?.nextSibling === end && newChild != null) {
			currentChild.replaceWith(newChild);
		} else {
			truncate(currentChild, end);

			if (newChild != null) {
				start.after(newChild);
			}
		}

		prevResult = currentResult;
	}, ...refAll(start, end));

	return frag;
}

function refAll(...args) {
	return args.map((arg) => new WeakRef(arg));
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

let htmlMap = new WeakMap();
let tokensRegex = /(?<!\\)(<!--|-->|<[\w-]+|<\/[\w-]+>|\/>|[\'\"=>])/;

function template(namespace) {
	return (strs, ...args) => {
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
							namespace,
							attrs: [],
							nodes: [],
						});

						nodes.push(stack[0]);
					} else {
						nodes.push({dynamic, value: token});
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
							attr = {name, dynamic: false, value: true};

							attrs.push(attr);
						}
					}
				} else if (mode === 2) {
					if (token === "'" || token === '"') {
						attr.value = "";
						quote = token;

						mode = 3;
					} else if (dynamic) {
						attr.value = token;
						attr.dynamic = true;

						mode = 1;
					} else {
						throw Error();
					}
				} else if (token === quote) {
					mode = 1;

					quote = null;
				} else {
					attr.value += token;
				}
			}

			htmlMap.set(strs, node);
		}

		return {node, args};
	};
}

export let html = template("http://www.w3.org/1999/xhtml");
export let svg = template("http://www.w3.org/2000/svg");
export let math = template("http://www.w3.org/1998/Math/MathML");

function* tokenize(...strs) {
	for (let i = 0; i < strs.length; i++) {
		yield* strs[i].split(tokensRegex);

		if (i < strs.length - 1) {
			yield i;
		}
	}
}

export function create({node, args}) {
	let element;

	if (node.name != null && node.namespace != null) {
		element = document.createElementNS(node.namespace, node.name);
	} else {
		element = document.createDocumentFragment();
	}

	for (let attr of node?.attrs ?? []) {
		if (attr.dynamic) {
			let value = args[attr.value];

			if (attr.name.startsWith("@")) {
				element.addEventListener(attr.name.substring(1), ...[].concat(value));
			} else if (attr.name.startsWith(".")) {
				mutation((element) => {
					element[attr.name.substring(1)] = value();
				}, ...refAll(element));
			} else if (typeof value === "function") {
				mutation((element) => {
					let current = value();

					if (typeof current === "boolean") {
						element.toggleAttribute(attr.name, current);
					} else {
						element.setAttribute(attr.name, current);
					}
				}, ...refAll(element));
			} else if (
				["class", "style", "data"].includes(attr.name) &&
				typeof value === "object"
			) {
				for (let [k, v] of Object.entries(value)) {
					if (typeof v === "function") {
						mutation((element) => {
							let current = v();

							switch (attr.name) {
								case "class":
									element.classList.toggle(k, !!current);
									break;

								case "style":
									element.style.setProperty(k, current);
									break;

								case "data":
									element.dataset[k] = current;
									break;
							}
						}, ...refAll(element));
					} else {
						switch (attr.name) {
							case "class":
								element.classList.toggle(k, !!v);
								break;

							case "style":
								element.style.setProperty(k, v);
								break;

							case "data":
								element.dataset[k] = v;
								break;
						}
					}
				}
			} else if (typeof value === "boolean") {
				element.toggleAttribute(attr.name, value);
			} else {
				element.setAttribute(attr.name, value);
			}
		} else {
			element.setAttribute(attr.name, attr.value);
		}
	}

	for (let n of node?.nodes ?? []) {
		if (n.dynamic) {
			let value = args[n.value];

			if (value[Symbol.iterator]) {
				for (let v of Array.from(value).flat(Infinity)) {
					if (v.node != null) {
						element.append(create(v));
					} else {
						element.append(v);
					}
				}
			} else if (typeof value === "function") {
				let text = document.createTextNode("");

				mutation((text) => {
					text.nodeValue = value();
				}, ...refAll(text));

				element.append(text);
			} else if (value.node != null && value.args != null) {
				element.append(create(value));
			} else {
				element.append(value);
			}
		} else if (n.name != null && n.namespace != null) {
			element.append(create({node: n, args}));
		} else {
			element.append(n.value);
		}
	}

	return element;
}
