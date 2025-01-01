let current;
let queue = [];
let reads = new WeakMap();
let registered = new WeakSet();
let scheduled = false;

class Collection {
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
		children = children.flat(Infinity);

		let element = this.element?.deref();

		if (element) {
			for (let child of children) {
				if (typeof child === "object") {
					if (child instanceof Element) {
						child = child.element?.deref();

						if (child) {
							element.append(child);
						}
					} else if (child instanceof Collection) {
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

function modify(o, key) {
	let callbacks = reads.get(o).get(key);

	if (callbacks) {
		for (let cb of callbacks) {
			effect(cb);
		}

		callbacks.clear();
	}
}

function set(o, key, value, r) {
	modify(o, key);

	return Reflect.set(o, key, value, r);
}

function deleteProperty(o, key) {
	modify(o, key);

	return Reflect.deleteProperty(o, key);
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

	return new Proxy(object, {set, get, deleteProperty});
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
	return new Collection(list);
}

const attributeObserver = new MutationObserver((mutationList, observer) => {
	for (const {target, attributeName} of mutationList) {
		target.watched[attributeName] = target.getAttribute(attributeName);
	}
});

export function define(name, view) {
	customElements.define(
		name,
		class extends HTMLElement {
			watched = watch({});

			connectedCallback() {
				let target = use(this);

				for (let attr of this.attributes) {
					this.watched[attr.name] = attr.value;
				}

				attributeObserver.observe(this, {attributes: true});

				target.append(view.call(target, this.watched));
			}
		}
	);
}
