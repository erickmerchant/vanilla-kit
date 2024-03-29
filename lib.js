/* Reactivity */

let currentCallback;
let effectScheduled = false;
let effectQueue = [];
let reads = new WeakMap();

export function effect(...callbacks) {
	effectQueue.push(...callbacks);

	if (!effectScheduled) {
		effectScheduled = true;

		setTimeout(() => {
			effectScheduled = false;

			for (let callback of effectQueue.splice(0, Infinity)) {
				immediateEffect(callback);
			}
		}, 0);
	}
}

export function watch(object) {
	reads.set(object, new Map());

	return new Proxy(object, {set, get});
}

function immediateEffect(callback) {
	let prevCallback = currentCallback;

	currentCallback = callback;

	callback();

	currentCallback = prevCallback;
}

function mutationEffect(callback, ...refs) {
	immediateEffect(() => {
		let derefs = refs.map((ref) => (ref.deref ? ref.deref() : ref));

		if (derefs.some((arg) => arg == null)) {
			return;
		}

		callback(...derefs);
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

export let tags = {};

for (let [key, namespace] of [
	["html", "http://www.w3.org/1999/xhtml"],
	["svg", "http://www.w3.org/2000/svg"],
]) {
	tags[key] = new Proxy(
		{},
		{
			get(_, name) {
				return (props, ...children) => ({
					name,
					namespace,
					props,
					children: children.flat(Infinity),
				});
			},
		}
	);
}

/* Rendering */

let attrs = new WeakMap();

export function attr(value) {
	let symbol = Symbol();

	attrs.set(symbol, value);

	return symbol;
}

export function render(nodes, element) {
	let document = element.ownerDocument;

	nodes = [].concat(nodes).flat(Infinity);

	for (let node of nodes) {
		if (node == null) continue;

		if (typeof node === "string") {
			element.append(node);
		} else if (typeof node === "function") {
			let [start, end] = getBounds();

			element.append(start, end);

			mutationEffect(node, ...refAll(start, end));
		} else {
			let childElement = document.createElementNS(node.namespace, node.name);

			for (let [name, value] of Object.entries(node.props)) {
				if (typeof value === "function" && name.startsWith("on")) {
					name = name.slice(2).toLowerCase();

					childElement.addEventListener(name, ...[].concat(value));
				} else {
					let isAttr = typeof value === "symbol" && attrs.has(value);

					mutationEffect((subElement) => {
						let currentValue = value;

						if (isAttr) {
							currentValue = attrs.get(currentValue);
						}

						currentValue = callOrReturn(currentValue);

						if (isAttr) {
							if (currentValue == null) {
								subElement.removeAttribute(name);
							} else if (currentValue === true || currentValue === false) {
								subElement.toggleAttribute(name, currentValue);
							} else {
								subElement.setAttribute(name, currentValue);
							}
						} else {
							if (subElement[name] !== currentValue) {
								subElement[name] = currentValue;
							}
						}
					}, ...refAll(childElement));
				}
			}

			render(node.children, childElement);

			element.append(childElement);
		}
	}
}

/* Renderers */

export function each(list, callback) {
	let views = [];

	return (_, end) => {
		let index = 0;

		for (; index < list.length; index++) {
			let item = list[index];
			let view = views[index];

			if (!view) {
				let bounds = getBounds();

				end.before(...bounds);

				let refs = refAll(...bounds);
				let data = watch({item, index});
				let inc = include(() => {
					return callback(data);
				});

				mutationEffect(inc, ...refs);

				views.push([refs[0], data]);
			} else {
				let [_, data] = view;

				if (data.item !== item) {
					data.item = item;
				}

				if (data.index !== index) {
					data.index = index;
				}
			}
		}

		let currentChild = views[index]?.[0]?.deref();

		truncate(currentChild, end);

		views.splice(index, Infinity);
	};
}

export function include(callback) {
	let prevResult = null;

	return (start, end) => {
		let currentChild = start.nextSibling;
		let currentResult = callback();
		let newChild;

		if (currentResult == null && prevResult == null) {
			return;
		} else if (typeof currentResult === "object") {
			if (prevResult === currentResult) return;

			newChild = new DocumentFragment();

			render(currentResult, newChild);
		} else {
			if (prevResult === currentResult) return;

			newChild = currentResult;
		}

		truncate(currentChild, end);

		if (newChild) {
			start.after(newChild);
		}

		prevResult = currentResult;
	};
}

export function text(callback) {
	let initialized = false;

	return (start) => {
		let currentResult = String(callback() ?? "");

		if (!initialized) {
			let text = document.createTextNode(currentResult);

			start.after(text);

			initialized = true;
		} else {
			let currentChild = start.nextSibling;

			if (currentChild.nodeValue !== currentResult) {
				currentChild.nodeValue = currentResult;
			}
		}
	};
}

/* Utils */

function getBounds() {
	return [document.createComment(""), document.createComment("")];
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

function callOrReturn(value) {
	return typeof value === "function" ? value() : value;
}
