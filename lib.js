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

	map(mapper) {
		this.mapper = mapper;

		return this;
	}

	filter(filterer) {
		this.filterer = filterer;

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

	attr(key, value) {
		this.#mutate((element, value) => {
			if (value == null) {
				element.removeAttribute(key);
			} else if (value === true || value === false) {
				element.toggleAttribute(key, value);
			} else {
				element.setAttribute(key, value);
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

	#bounds(element) {
		let bounds = [document.createComment(""), document.createComment("")];

		element.append(...bounds);

		bounds = bounds.map((c) => new WeakRef(c));

		return () => bounds.map((b) => b.deref());
	}

	append(...children) {
		let element = this.element?.deref();

		if (element) {
			for (let child of children) {
				if (typeof child === "object") {
					if (child instanceof Element) {
						child = child.element?.deref();

						if (child) {
							element.append(child);
						}
					} else if (child instanceof Each) {
						let views = [];
						let bounds = this.#bounds(element);

						this.#mutate(() => {
							let [start, end] = bounds();
							let currentChild =
								start && start.nextSibling !== end ? start.nextSibling : null;
							let fragment = new DocumentFragment();
							let i = 0;

							for (let index = 0; index < child.list.length; index++) {
								let item = child.list[index];

								if (!child.filterer({item, index})) {
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
									let element = child.mapper(view)?.element?.deref();

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
				} else if (typeof child === "function") {
					let bounds = this.#bounds(element);

					this.#mutate(() => {
						let [start, end] = bounds();
						let currentChild = start ? start.nextSibling : null;
						while (currentChild && currentChild !== end) {
							let nextChild = currentChild.nextSibling;

							currentChild.remove();

							currentChild = nextChild;
						}

						let fragment = new DocumentFragment();
						let c = child();

						if (c != null) {
							if (typeof c === "object" && c instanceof Element) {
								c = c.element?.deref();
							}

							fragment.append(c);

							end.before(fragment);
						}
					});
				} else {
					element.append(child);
				}
			}
		}

		return this;
	}

	text(txt) {
		this.#mutate((element, txt) => {
			element.textContent = txt;
		}, txt);

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
