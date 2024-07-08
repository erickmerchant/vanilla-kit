let currentCallback;
let effectScheduled = false;
let effectQueue = [];
let reads = new WeakMap();
let values = new WeakMap();

class Element {
	#element;

	constructor(element) {
		this.element = element;
	}

	get element() {
		return this.#element?.deref();
	}

	set element(element) {
		this.#element = new WeakRef(element);
	}

	#chain(cb, ...args) {
		let element = this.element;

		if (element != null) {
			cb(element, ...args);
		}

		return this;
	}

	attr(...args) {
		return this.#chain(
			(element, name, value) => {
				mutation((element) => {
					let current = typeof value === "function" ? value() : value;

					if (current == null || current === true || current === false) {
						element.toggleAttribute(name, !!current);
					} else {
						element.setAttribute(name, current);
					}
				}, element);
			},
			...args
		);
	}

	prop(...args) {
		return this.#chain(
			(element, name, value) => {
				mutation((element) => {
					let current = typeof value === "function" ? value() : value;

					if (element[name] !== current) {
						element[name] = current;
					}
				}, element);
			},
			...args
		);
	}

	classes(...args) {
		return this.#chain(
			(element, ...values) => {
				for (let value of values.flat(Infinity)) {
					if (value == null) continue;

					if (typeof value === "string") {
						value = {[value]: true};
					}

					for (let [name, v] of Object.entries(value)) {
						mutation((element) => {
							let current = typeof v === "function" ? v() : v;

							element.classList.toggle(name, !!current);
						}, element);
					}
				}
			},
			...args
		);
	}

	styles(...args) {
		return this.#chain(
			(element, values) => {
				for (let [name, v] of Object.entries(values)) {
					mutation((element) => {
						let current = typeof v === "function" ? v() : v;

						element.style.setProperty(name, current);
					}, element);
				}
			},
			...args
		);
	}

	data(...args) {
		return this.#chain(
			(element, values) => {
				for (let [name, v] of Object.entries(values)) {
					mutation((element) => {
						let current = typeof v === "function" ? v() : v;

						if (element.dataset[name] !== current) {
							element.dataset[name] = current;
						}
					}, element);
				}
			},
			...args
		);
	}

	on(...args) {
		return this.#chain(
			(element, key, ...value) => {
				for (let k of [].concat(key)) {
					element.addEventListener(k, ...value);
				}
			},
			...args
		);
	}

	children(...args) {
		return this.#chain(
			(element, ...children) => {
				for (let child of children.flat(Infinity)) {
					if (typeof child === "function") {
						let document = element.ownerDocument;
						let [start, end] = [
							document.createComment(""),
							document.createComment(""),
						];

						element.append(start, end);

						mutation(
							(start, end) => {
								let currentChild = start.nextSibling;

								while (currentChild) {
									if (currentChild === end) {
										break;
									}

									let nextChild = currentChild.nextSibling;

									currentChild.remove();

									currentChild = nextChild;
								}

								let newChild = child();

								newChild =
									newChild instanceof Element ? newChild.element : newChild;

								if (newChild != null) {
									start.after(newChild);
								}
							},
							start,
							end
						);
					} else if (child != null) {
						child = child instanceof Element ? child.element : child;

						if (child != null) {
							element.append(child);
						}
					}
				}
			},
			...args
		);
	}
}

export function watch(object) {
	reads.set(object, new Map());

	return new Proxy(object, {set, get});
}

export function effect(callback) {
	let prevCallback = currentCallback;

	currentCallback = callback;

	callback();

	currentCallback = prevCallback;
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
						t[key](...args);
					}

					return proxy;
				};
			},
		}
	);
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

	let value = Reflect.get(o, key, r);

	if (typeof value === "symbol" && values.has(value)) {
		value = values.get(value);
	}

	return value;
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

	if (typeof value === "object") {
		let symbol = Symbol("");

		values.set(symbol, value);

		value = symbol;
	}

	return Reflect.set(o, key, value, r);
}

function mutation(callback, ...args) {
	let refs = args.map((arg) => new WeakRef(arg));

	effect(() => {
		let derefs = refs.map((ref) => ref.deref());

		if (derefs.some((arg) => arg == null)) {
			return;
		}

		callback(...derefs);
	});
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
