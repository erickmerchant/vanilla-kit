/* Reactivity */

let currentCallback;
let effectScheduled = false;
let effectQueue = [];
let reads = new WeakMap();
let bindings = new WeakMap();

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
		scheduledEffect(...callbacks);

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

function scheduledEffect(...callbacks) {
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
}

export function mutationEffect(callback, ...refs) {
	effect(() => {
		let derefs = refs.map((ref) => ref.deref());

		if (derefs.some((arg) => arg == null)) {
			return;
		}

		callback(...derefs);
	});
}

/* Declarative */

export class Element {
	constructor(element) {
		this.element = element;
	}
}

export function mixin(methods) {
	for (let [name, method] of Object.entries(methods)) {
		Element.prototype[name] = function (...args) {
			method(this.element, ...args);

			return this;
		};
	}
}

function h(name, namespace) {
	let root = (n = name) => {
		return new Element(globalThis.document.createElementNS(namespace, n));
	};

	return new Proxy(root, {
		get(_, name) {
			return () => root(name);
		},
	});
}

export function $(...target) {
	return new Proxy(
		target.map((t) => {
			return new Element(t);
		}),
		{
			get(target, key, proxy) {
				return (...args) => {
					for (let t of target) {
						t[key].call(t, ...args);
					}

					return proxy;
				};
			},
		}
	);
}

export let html = h("html", "http://www.w3.org/1999/xhtml");
export let svg = h("svg", "http://www.w3.org/2000/svg");
export let math = h("math", "http://www.w3.org/1998/Math/MathML");

/* Fluent */

export function unwrap(element) {
	return element;
}

export function attr(element, name, value) {
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

export function prop(element, name, value) {
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

export function on(element, key, ...value) {
	for (let k of [].concat(key)) {
		element.addEventListener(k, ...value);
	}
}

export function map(element, list, callback) {
	let views = [];

	let [start, end] = getStartAndEnd(element.ownerDocument);

	element.append(start, end);

	mutationEffect((_, end) => {
		for (let index = 0; index < list.length; index++) {
			let item = list[index];
			let view = views[index];

			if (!view) {
				let data = watch({item, index});
				let fragment = new DocumentFragment();

				bindings.set(fragment, data);

				append(fragment, callback);

				views.push([new WeakRef(fragment.firstChild), data]);

				end.before(fragment);
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

		let currentChild = views[list.length]?.[0]?.deref();

		truncate(currentChild, end);

		views.splice(list.length, Infinity);
	}, ...refAll(start, end));
}

export function append(element, ...children) {
	for (let child of children.flat(Infinity)) {
		if (typeof child === "function") {
			let prevResult = null;

			let [start, end] = getStartAndEnd(element.ownerDocument);

			bindings.set(start, bindings.get(element));

			element.append(start, end);

			mutationEffect((start, end) => {
				let currentChild = start.nextSibling;
				let currentResult = callOrReturn(child, bindings.get(start));
				let newChild;

				if (
					(currentResult == null && prevResult == null) ||
					currentResult === prevResult
				) {
					return;
				} else if (currentResult != null) {
					if (
						typeof currentResult === "object" ||
						typeof currentResult === "function"
					) {
						let unwrappedResult = callOrReturn(
							currentResult,
							bindings.get(start)
						);

						newChild = new DocumentFragment();

						if (unwrappedResult != null) {
							newChild.append(
								...[]
									.concat(unwrappedResult)
									.map((r) => (r instanceof Element ? r?.element : r))
									.filter((r) => r != null)
							);
						}
					} else {
						newChild = currentResult;
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
		} else if (child != null) {
			element.append(child instanceof Element ? child?.element : child);
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
