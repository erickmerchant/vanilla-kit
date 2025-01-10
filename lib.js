let current;
let queue = [];
let reads = new WeakMap();
let registered = new WeakSet();
let scheduled = false;
let _namespace;
let attributeObserver = new MutationObserver((mutationList) => {
	for (let {target, attributeName} of mutationList) {
		target.watched[attributeName] = target.getAttribute(attributeName);
	}
});

export let svg_namespace = "http://www.w3.org/2000/svg";

class Collection {
	#list;
	#map;
	#filter = () => true;
	#views = [];

	constructor(list) {
		this.#list = list;
	}

	map(mapper) {
		this.#map = mapper;

		return this;
	}

	filter(filter) {
		this.#filter = filter;

		return this;
	}

	*[Symbol.iterator]() {
		let i = 0;

		for (let [index, item] of this.#list.entries()) {
			if (!this.#filter({item, index})) {
				continue;
			}

			let view = this.#views[i];

			if (!view) {
				view = watch({});

				this.#views.push(view);
			}

			if (item !== view.item) {
				view.item = item;
			}

			view.index = index;

			yield () => {
				return this.#map(view);
			};

			i++;
		}

		this.#views.splice(i, Infinity);
	}
}

class Element {
	#element;

	get element() {
		return this.#element?.deref();
	}

	constructor(element) {
		this.#element = new WeakRef(element);
	}

	prop(key, value) {
		this.#mutate((element, value) => {
			element[key] = value;
		}, value);

		return this;
	}

	attr(key, value) {
		this.#mutate((element, value) => {
			if (value === true || value === false || value == null) {
				element.toggleAttribute(key, !!value);
			} else {
				element.setAttribute(key, value);
			}
		}, value);

		return this;
	}

	classes(...classes) {
		classes = classes.flat(Infinity).reduce((acc, c) => {
			if (typeof c === "object") {
				Object.assign(acc, c);
			} else {
				acc[c] = true;
			}

			return acc;
		}, {});

		for (let [key, value] of Object.entries(classes)) {
			this.#mutate((element, value) => {
				for (let k of key.split(" ")) {
					element.classList.toggle(k, value);
				}
			}, value);
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
		let element = this.element;

		if (element) {
			for (let event of [].concat(events)) {
				element.addEventListener(event, handler, options);
			}
		}

		return this;
	}

	append(...children) {
		children = children.flat(Infinity);

		let element = this.element;

		if (element) {
			for (let child of children) {
				if (typeof child === "function") {
					child = [child];
				}

				let isObject = typeof child === "object";

				if (isObject && child instanceof Element) {
					child = child.element;

					if (child) {
						element.append(child);
					}
				} else if (isObject && child[Symbol.iterator] != null) {
					let bounds = comments(element);

					this.#mutate(() => {
						let [start, end] = bounds();
						let currentChild =
							start && start.nextSibling !== end ? start.nextSibling : null;
						let fragment = new DocumentFragment();

						for (let item of child) {
							if (!currentChild) {
								let result = item();
								let element = result?.element ?? result;

								if (element != null) {
									fragment.append(element);
								}
							}

							currentChild =
								currentChild?.nextSibling !== end
									? currentChild?.nextSibling
									: null;
						}

						end.before(fragment);

						clear(currentChild, end);
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

	#mutate(callback, value = () => {}) {
		let immediate = typeof value !== "function";
		let cb = () => {
			let el = this.element;

			if (el && registered.has(el)) {
				callback(el, immediate ? value : value());
			}
		};
		let el = this.element;

		if (el) {
			registered.add(el);
		}

		if (immediate) {
			cb();
		} else {
			effect(cb);
		}
	}
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

export function use(element) {
	return new Element(element);
}

export function namespace(ns, cb) {
	_namespace = ns;

	let result = cb();

	_namespace = null;

	return result;
}

export function create(tag) {
	return use(
		_namespace
			? document.createElementNS(_namespace, tag)
			: document.createElement(tag)
	);
}

export function each(list) {
	return new Collection(list);
}

export function define(name, view, shadow = false) {
	customElements.define(
		name,
		class extends HTMLElement {
			watched = watch({});

			connectedCallback() {
				let host = use(this);
				let target = host;

				if (shadow) {
					if (!this.shadowRoot) {
						this.attachShadow({
							mode: typeof shadow === "string" ? shadow : "open",
						});
					}

					target = use(this.shadowRoot);
				}

				for (let attr of this.attributes) {
					this.watched[attr.name] = attr.value;
				}

				attributeObserver.observe(this, {attributes: true});

				target.append(view.call(host, this.watched));
			}
		}
	);
}

function clear(currentChild, end) {
	while (currentChild && currentChild !== end) {
		let nextChild = currentChild.nextSibling;

		currentChild.remove();

		currentChild = nextChild;
	}
}

function comments(element) {
	let bounds = [document.createComment(""), document.createComment("")];

	element.append(...bounds);

	bounds = bounds.map((c) => new WeakRef(c));

	return () => bounds.map((b) => b.deref());
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
