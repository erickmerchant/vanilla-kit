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

export function mutation(callback, ...refs) {
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

export function h(name, namespace) {
	let root = (n = name) => {
		return new Element(globalThis.document.createElementNS(namespace, n));
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

/* Fluent */

export function unwrap(element) {
	return element;
}

function _attr(element, name, value) {
	if (value == null) {
		element.removeAttribute(name);
	} else if (value === true || value === false) {
		element.toggleAttribute(name, value);
	} else {
		element.setAttribute(name, value);
	}
}

export function attr(element, name, value) {
	if (typeof value === "function") {
		mutation((element) => {
			_attr(element, name, value());
		}, ...refAll(element));
	} else {
		_attr(element, name, value);
	}
}

function _prop(element, name, value) {
	if (element[name] !== value) {
		element[name] = value;
	}
}

export function prop(element, name, value) {
	if (typeof value === "function") {
		mutation((element) => {
			_prop(element, name, value());
		}, ...refAll(element));
	} else {
		_prop(element, name, value);
	}
}

function _class(element, name, value) {
	element.classList.toggle(name, !!value);
}

export function classes(element, ...values) {
	for (let value of values) {
		if (typeof value === "string") {
			_class(element, value, true);
		} else {
			for (let [name, v] of Object.entries(value)) {
				if (typeof v === "function") {
					mutation((element) => {
						_class(element, name, v());
					}, ...refAll(element));
				} else {
					_class(element, name, v);
				}
			}
		}
	}
}

function _style(element, name, value) {
	element.style.setProperty(name, value);
}

export function styles(element, values) {
	for (let [name, v] of Object.entries(values)) {
		if (typeof v === "function") {
			mutation((element) => {
				_style(element, name, v());
			}, ...refAll(element));
		} else {
			_style(element, name, v);
		}
	}
}

function _data(element, name, value) {
	if (element.dataset[name] !== value) {
		element.dataset[name] = value;
	}
}

export function data(element, values) {
	for (let [name, v] of Object.entries(values)) {
		if (typeof v === "function") {
			mutation((element) => {
				_data(element, name, v());
			}, ...refAll(element));
		} else {
			_data(element, name, v);
		}
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

	mutation((_, end) => {
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
	for (let child of children) {
		if (typeof child === "function") {
			let prevResult = null;

			let [start, end] = getStartAndEnd(element.ownerDocument);

			bindings.set(start, bindings.get(element));

			element.append(start, end);

			mutation((start, end) => {
				let currentChild = start.nextSibling;
				let currentResult = child(bindings.get(start));
				let newChild;

				if (
					(currentResult == null && prevResult == null) ||
					currentResult === prevResult
				) {
					return;
				} else if (currentResult != null) {
					currentResult =
						typeof currentResult === "function"
							? currentResult(bindings.get(start))
							: currentResult;

					if (typeof currentResult === "object") {
						newChild = new DocumentFragment();

						if (currentResult != null) {
							let list = [];

							for (let item of [].concat(currentResult)) {
								if (item != null) {
									list.push(item instanceof Element ? item?.element : item);
								}
							}

							newChild.append(...list);
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
