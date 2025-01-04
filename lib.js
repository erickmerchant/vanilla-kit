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

	#run(callback, value = () => {}) {
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
		this.#run((element, value) => {
			element[key] = value;
		}, value);

		return this;
	}

	attr(key, value) {
		this.#run((element, value) => {
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
		classes = classes.flat(Infinity).reduce((acc, c) => {
			if (typeof c === "object") {
				Object.assign(acc, c);
			} else {
				acc[c] = true;
			}

			return acc;
		}, {});

		for (let [key, value] of Object.entries(classes)) {
			this.#run((element, value) => {
				let keys = key.split(" ");

				for (let k of keys) {
					element.classList.toggle(k, value);
				}
			}, value);
		}

		return this;
	}

	styles(styles) {
		for (let [key, value] of Object.entries(styles)) {
			this.#run((element, value) => {
				element.style.setProperty(key, value);
			}, value);
		}

		return this;
	}

	data(data) {
		for (let [key, value] of Object.entries(data)) {
			this.#run((element, value) => {
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
				let isObject = typeof child === "object";

				if (isObject && child instanceof Element) {
					child = child.element?.deref();

					if (child) {
						element.append(child);
					}
				} else if (isObject && child instanceof Collection) {
					let views = [];
					let bounds = this.#bounds(element);

					this.#run(() => {
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
				} else if (typeof child === "function") {
					let bounds = this.#bounds(element);

					this.#run(() => {
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

							if (c != null) {
								fragment.append(c);
							}

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
		this.#run((element, txt) => {
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

export function use(element) {
	return new Element(element);
}

export let svg_namespace = "http://www.w3.org/2000/svg";

let namespace;

export function svg(cb) {
	namespace = svg_namespace;

	let result = cb();

	namespace = null;

	return result;
}

export function create(tag) {
	return use(
		namespace
			? document.createElementNS(namespace, tag)
			: document.createElement(tag)
	);
}

export function each(list) {
	return new Collection(list);
}

let attributeObserver = new MutationObserver((mutationList) => {
	for (let {target, attributeName} of mutationList) {
		target.watched[attributeName] = target.getAttribute(attributeName);
	}
});

export function define(name, view, shadow = false) {
	customElements.define(
		name,
		class extends HTMLElement {
			watched = watch({});

			connectedCallback() {
				let host = use(this);
				let target = host;

				if (shadow) {
					this.attachShadow({
						mode: typeof shadow === "string" ? shadow : "open",
					});

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
