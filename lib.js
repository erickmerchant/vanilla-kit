/* Reactivity */

let currentCallback;
let effectScheduled = false;
let effectQueue = [];
let reads = new WeakMap();
let mixins = {};

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
	children = [];
	props = [];

	constructor(name, namespace) {
		this.name = name;
		this.namespace = namespace;
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

export function mixin(...ms) {
	for (let m of ms) {
		Node.prototype[m.name] = function (...args) {
			this.props.push([m.name, ...args]);

			return this;
		};

		mixins[m.name] = m;
	}
}

function h(name, namespace) {
	let root = (n = name) => {
		return new Node(n, namespace);
	};

	return new Proxy(root, {
		get(_, name) {
			return () => root(name);
		},
	});
}

export let html = h("html", "http://www.w3.org/1999/xhtml");
export let svg = h("svg", "http://www.w3.org/2000/svg");
export let math = h("math", "http://www.w3.org/1998/Math/MathML");

/* Mixins + Helpers */

export function attr(element, ...args) {
	let [name, value] = args;

	mutationEffect((element) => {
		let currentValue = value;

		currentValue = callOrReturn(currentValue);

		if (currentValue == null) {
			element.removeAttribute(name);
		} else if (currentValue === true || currentValue === false) {
			element.toggleAttribute(name, currentValue);
		} else {
			element.setAttribute(name, currentValue);
		}
	}, ...refAll(element));
}

export function prop(element, ...args) {
	let [name, value] = args;

	mutationEffect((element) => {
		let currentValue = value;

		currentValue = callOrReturn(currentValue);

		if (element[name] !== currentValue) {
			element[name] = currentValue;
		}
	}, ...refAll(element));
}

export function classes(element, ...args) {
	args = args.flat(Infinity);

	for (let arg of args) {
		if (typeof arg === "string") {
			element.classList.add(arg);
		} else {
			for (let [name, value] of Object.entries(arg)) {
				mutationEffect((element) => {
					let currentValue = value;

					currentValue = callOrReturn(currentValue);

					element.classList.toggle(name, !!currentValue);
				}, ...refAll(element));
			}
		}
	}
}

export function styles(element, styles) {
	for (let [name, value] of Object.entries(styles)) {
		mutationEffect((element) => {
			let currentValue = value;

			currentValue = callOrReturn(currentValue);

			element.style.setProperty(name, currentValue);
		}, ...refAll(element));
	}
}

export function data(element, data) {
	for (let [name, value] of Object.entries(data)) {
		mutationEffect((element) => {
			let currentValue = value;

			currentValue = callOrReturn(currentValue);

			if (element.dataset[name] !== currentValue) {
				element.dataset[name] = currentValue;
			}
		}, ...refAll(element));
	}
}

export function on(element, key, value) {
	for (let k of [].concat(key)) {
		element.addEventListener(k, ...[].concat(value));
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
				let startAndEnd = getStartAndEnd(document);

				end.before(...startAndEnd);

				let refs = refAll(...startAndEnd, document);
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

/* Rendering */

export function render(nodes, element) {
	let document = element.ownerDocument;

	nodes = [].concat(nodes).flat(Infinity);

	for (let node of nodes) {
		if (node == null) continue;

		if (typeof node === "string") {
			element.append(node);
		} else if (typeof node === "function") {
			let [start, end] = getStartAndEnd(document);

			element.append(start, end);

			mutationEffect(node, ...refAll(start, end, document));
		} else {
			let childElement = document.createElementNS(node.namespace, node.name);

			for (let [kind, ...args] of node.props) {
				mixins[kind](childElement, ...args);
			}

			render(node.children, childElement);

			element.append(childElement);
		}
	}
}

/* Utils */

function getStartAndEnd(document) {
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
