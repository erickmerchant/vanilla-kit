let current;
let queue = [];
let reads = new WeakMap();
let registered = new WeakSet();
let scheduled = false;

class Each {
	list;
	mapper;
	filterer = () => true;

	constructor(list) {
		this.list = list;
	}

	map(callback) {
		this.mapper = callback;

		return this;
	}

	filter(callback) {
		this.filterer = callback;

		return this;
	}
}

class Element {
	element;

	constructor(element) {
		this.element = new WeakRef(element);
	}

	#mutate(callback, value = () => {}) {
		let immediate = typeof value !== "function";

		let cb = () => {
			let element = this.element?.deref();

			if (element && registered.has(element)) {
				callback(element, immediate ? value : value());
			}
		};
		let element = this.element?.deref();

		if (element) {
			registered.add(element);
		}

		if (immediate) {
			cb();
		} else {
			effect(cb);
		}
	}

	prop(key, value) {
		this.#mutate((element, value) => {
			element[key] = value;
		}, value);

		return this;
	}

	attr(key, value, namespace) {
		this.#mutate((element, value) => {
			if (namespace) {
				if (value == null) {
					element.removeAttributeNS(namespace, key);
				} else if (value === true || value === false) {
					element.toggleAttributeNS(namespace, key, value);
				} else {
					element.setAttributeNS(namespace, key, value);
				}
			} else {
				if (value == null) {
					element.removeAttribute(key);
				} else if (value === true || value === false) {
					element.toggleAttribute(key, value);
				} else {
					element.setAttribute(key, value);
				}
			}
		}, value);

		return this;
	}

	classes(...classes) {
		classes = classes.flat(Infinity);

		for (let c of classes) {
			if (typeof c === "object") {
				for (let [key, value] of Object.entries(c)) {
					this.#mutate((element, value) => {
						element.classList.toggle(key, value);
					}, value);
				}
			} else {
				let element = this.element?.deref();

				if (element) {
					element.classList?.add(c, true);
				}
			}
		}

		return this;
	}

	styles(styles) {
		for (let [key, value] of Object.entries(styles)) {
			this.#mutate((element, value) => {
				element.style.setProperty(key, value);
			}, value);
		}

		return this;
	}

	data(data) {
		for (let [key, value] of Object.entries(data)) {
			this.#mutate((element, value) => {
				element.dataSet[key] = value;
			}, value);
		}

		return this;
	}

	on(events, handler, options = {}) {
		let element = this.element?.deref();

		if (element) {
			for (let event of [].concat(events)) {
				element.addEventListener(event, handler, options);
			}
		}

		return this;
	}

	append(...values) {
		let element = this.element?.deref();

		if (element) {
			for (let value of values) {
				if (typeof value === "object") {
					if (value instanceof Element) {
						let child = value.element?.deref();

						if (child) {
							element.append(child);
						}
					} else if (value instanceof Each) {
						let views = [];
						let bounds = [
							document.createComment(""),
							document.createComment(""),
						];

						element.append(...bounds);

						bounds = bounds.map((c) => new WeakRef(c));

						this.#mutate(() => {
							let start = bounds[0].deref();
							let end = bounds[1].deref();
							let currentChild =
								start && start.nextSibling !== end ? start.nextSibling : null;
							let fragment = new DocumentFragment();
							let i = 0;

							for (let index = 0; index < value.list.length; index++) {
								let item = value.list[index];

								if (!value.filterer({item, index})) {
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

								view.index = index;

								if (!currentChild) {
									let element = value.mapper(view)?.element?.deref();

									if (element) {
										fragment.append(element);
									}
								}

								currentChild =
									currentChild?.nextSibling !== end
										? currentChild?.nextSibling
										: null;

								i++;
							}

							end.before(fragment);

							views.splice(i, Infinity);

							while (currentChild && currentChild !== end) {
								let nextChild = currentChild.nextSibling;

								currentChild.remove();

								currentChild = nextChild;
							}
						});
					}
				} else if (typeof value === "function") {
					let bounds = [document.createComment(""), document.createComment("")];

					element.append(...bounds);

					bounds = bounds.map((c) => new WeakRef(c));

					this.#mutate(() => {
						let start = bounds[0].deref();
						let end = bounds[1].deref();
						let currentChild = start ? start.nextSibling : null;
						while (currentChild && currentChild !== end) {
							let nextChild = currentChild.nextSibling;

							currentChild.remove();

							currentChild = nextChild;
						}

						let fragment = new DocumentFragment();
						let child = value();

						if (child != null) {
							if (typeof child === "object" && child instanceof Element) {
								child = child.element?.deref();
							}

							fragment.append(child);

							end.before(fragment);
						}
					});
				} else {
					element.append(value);
				}
			}
		}

		return this;
	}

	text(value) {
		this.#mutate((element, value) => {
			element.textContent = value;
		}, value);

		return this;
	}
}

function get(o, key, r) {
	if (current) {
		let callbacks = reads.get(o).get(key);

		if (!callbacks) {
			callbacks = new Set();
			reads.get(o).set(key, callbacks);
		}

		callbacks.add(current);
	}

	return Reflect.get(o, key, r);
}

function set(o, key, value, r) {
	let callbacks = reads.get(o).get(key);

	if (callbacks) {
		for (let cb of callbacks) {
			effect(cb);
		}

		callbacks.clear();
	}

	return Reflect.set(o, key, value, r);
}

export function effect(callback) {
	queue.push(callback);

	if (!scheduled) {
		scheduled = true;

		setTimeout(() => {
			scheduled = false;

			let callbacks = queue.splice(0, Infinity);
			let prev = current;

			for (let cb of callbacks) {
				current = cb;

				cb();
			}

			current = prev;
		}, 0);
	}
}

export function watch(object) {
	reads.set(object, new Map());

	return new Proxy(object, {set, get});
}

export const svg_namespace = "http://www.w3.org/2000/svg";
export const xlink_namespace = "http://www.w3.org/1999/xlink";
export const mathml_namespace = "http://www.w3.org/1998/Math/MathML";

export function use(element) {
	return new Element(element);
}

export function create(tag, namespace) {
	return use(
		namespace
			? document.createElementNS(namespace, tag)
			: document.createElement(tag)
	);
}

export function each(list) {
	return new Each(list);
}
