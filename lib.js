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

export let tags = {};

for (let [k, namespace] of [
	["html", "http://www.w3.org/1999/xhtml"],
	["svg", "http://www.w3.org/2000/svg"],
]) {
	tags[k] = new Proxy(
		{},
		{
			get(_, key) {
				return (props, ...children) => ({
					name: key,
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
			let start = document.createComment("");
			let end = document.createComment("");

			element.append(start, end);

			mutationEffect(node, new WeakRef(start), new WeakRef(end));
		} else {
			let subElement = document.createElementNS(node.namespace, node.name);
			let subElementRef = new WeakRef(subElement);

			for (let [name, value] of Object.entries(node.props)) {
				if (typeof value === "function" && name.startsWith("on")) {
					name = name.slice(2).toLowerCase();

					subElement.addEventListener(name, ...[].concat(value));
				} else {
					mutationEffect((subElement) => {
						let isAttr = typeof value === "symbol" && attrs.has(value);
						let current = value;

						if (isAttr) {
							current = attrs.get(current);
						}

						current = callOrReturn(current);

						if (isAttr) {
							if (current == null) {
								subElement.removeAttribute(name);
							} else if (current === true || current === false) {
								subElement.toggleAttribute(name, current);
							} else {
								subElement.setAttribute(name, current);
							}
						} else {
							if (subElement[name] !== current) {
								subElement[name] = current;
							}
						}
					}, subElementRef);
				}
			}

			render(node.children, subElement);

			element.append(subElement);
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
				let s = document.createComment("");
				let e = document.createComment("");

				end.before(s, e);

				s = new WeakRef(s);
				e = new WeakRef(e);

				let d = watch({item, index});

				let inc = include(() => {
					return callback(d);
				});

				mutationEffect(inc, s, e);

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

	return (start, end) => {
		let currentChild = start.nextSibling;

		let current = callback();

		if (current == null && prev !== current) {
			truncate(currentChild, end);
		} else if (typeof current === "object") {
			if (prev === current) return;

			truncate(currentChild, end);

			let fragment = new DocumentFragment();

			render(current, fragment);

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
