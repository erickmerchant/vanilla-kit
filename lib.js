/* Reactivity */

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
		effect(...callbacks);

		callbacks.clear();
	}

	return Reflect.set(o, key, value, r);
}

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

/* Declarative */

class Node {
	constructor(name, namespace) {
		this.name = name;
		this.namespace = namespace;
		this.attrs = {};
		this._classes = {};
		this._styles = {};
		this.props = {};
		this.events = [];
		this.children = [];
	}

	attr(key, value) {
		this.attrs[key] = value;

		return this;
	}

	classes(...values) {
		values = values.flat(Infinity);

		for (let v of values) {
			if (typeof v === "string") {
				this._classes[v] = true;
			} else if (v != null) {
				for (let [key, val] of Object.entries(v)) {
					this._classes[key] = val;
				}
			}
		}

		return this;
	}

	styles(map) {
		for (let [key, value] of Object.entries(map)) {
			this._styles[key] = value;
		}

		return this;
	}

	data(map) {
		for (let [key, value] of Object.entries(map)) {
			this.attr(`data-${key}`, value);
		}

		return this;
	}

	prop(key, value) {
		this.props[key] = value;

		return this;
	}

	on(key, value) {
		this.events.push(...[].concat(key).map((k) => [k, value]));

		return this;
	}

	append(...children) {
		this.children.push(...children);

		return this;
	}

	text(value) {
		this.children = [text(value)];

		return this;
	}
}

export let h = {};

for (let [id, namespace] of [
	["html", "http://www.w3.org/1999/xhtml"],
	["svg", "http://www.w3.org/2000/svg"],
	["math", "http://www.w3.org/1998/Math/MathML"],
]) {
	h[id] = new Proxy(
		{},
		{
			get(_, name) {
				return () => new Node(name, namespace);
			},
		}
	);
}

/* Rendering */

export function render(nodes, element) {
	let document = element.ownerDocument;

	nodes = [].concat(nodes).flat(Infinity);

	for (let node of nodes) {
		if (node == null) continue;

		if (typeof node === "string") {
			element.append(node);
		} else if (typeof node === "function") {
			let [start, end] = getBounds(document);

			element.append(start, end);

			mutationEffect(node, ...refAll(start, end, document));
		} else {
			let childElement = document.createElementNS(node.namespace, node.name);

			for (let [name, value] of Object.entries(node.attrs)) {
				mutationEffect((subElement) => {
					let currentValue = value;

					currentValue = callOrReturn(currentValue);

					if (currentValue == null) {
						subElement.removeAttribute(name);
					} else if (currentValue === true || currentValue === false) {
						subElement.toggleAttribute(name, currentValue);
					} else {
						subElement.setAttribute(name, currentValue);
					}
				}, ...refAll(childElement));
			}

			for (let [name, value] of Object.entries(node._classes)) {
				mutationEffect((subElement) => {
					let currentValue = value;

					currentValue = callOrReturn(currentValue);

					subElement.classList.toggle(name, !!currentValue);
				}, ...refAll(childElement));
			}

			for (let [name, value] of Object.entries(node._styles)) {
				mutationEffect((subElement) => {
					let currentValue = value;

					currentValue = callOrReturn(currentValue);

					subElement.style.setProperty(name, currentValue);
				}, ...refAll(childElement));
			}

			for (let [name, value] of Object.entries(node.props)) {
				mutationEffect((subElement) => {
					let currentValue = value;

					currentValue = callOrReturn(currentValue);

					if (subElement[name] !== currentValue) {
						subElement[name] = currentValue;
					}
				}, ...refAll(childElement));
			}

			for (let [name, value] of node.events) {
				childElement.addEventListener(name, ...[].concat(value));
			}

			render(node.children, childElement);

			element.append(childElement);
		}
	}
}

/* Renderers */

export function each(list, callback) {
	let views = [];

	return (_, end, document) => {
		let index = 0;

		for (; index < list.length; index++) {
			let item = list[index];
			let view = views[index];

			if (!view) {
				let bounds = getBounds(document);

				end.before(...bounds);

				let refs = refAll(...bounds, document);
				let data = watch({item, index});
				let inc = include(callback, data);

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

export function include(callback, ...args) {
	let prevResult = null;

	return (start, end) => {
		let currentChild = start.nextSibling;
		let currentResult = callback(...args);
		let newChild;

		if (currentResult == null && prevResult == null) {
			return;
		} else if (
			typeof currentResult === "object" ||
			typeof currentResult === "function"
		) {
			if (prevResult === currentResult) {
				return;
			}

			let unwrappedResult = callOrReturn(currentResult, ...args);

			newChild = new DocumentFragment();

			render(unwrappedResult, newChild);
		} else {
			if (prevResult === currentResult) {
				return;
			}

			newChild = currentResult;
		}

		truncate(currentChild, end);

		if (newChild) {
			start.after(newChild);
		}

		prevResult = currentResult;
	};
}

export function text(value) {
	let initialized = false;

	return (start, _, document) => {
		let currentResult = String(callOrReturn(value) ?? "");

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

function getBounds(document) {
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

function callOrReturn(value, ...args) {
	return typeof value === "function" ? value(...args) : value;
}
