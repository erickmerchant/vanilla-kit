const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const ELEMENT = Symbol("element");

let current;
let queue = [];
let reads = new WeakMap();
let registered = new WeakSet();
let scheduled = false;
let attributeObserver = new MutationObserver((mutationList) => {
	for (let {target, attributeName} of mutationList) {
		target.watched[attributeName] = target.getAttribute(attributeName);
	}
});

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
	element = new WeakRef(element);

	return {
		[ELEMENT]: element,
		deref() {
			return element.deref();
		},
		prop(key, value) {
			mutate(
				element,
				(element, value) => {
					element[key] = value;
				},
				value
			);

			return this;
		},
		attr(key, value) {
			mutate(
				element,
				(element, value) => {
					if (value === true || value === false || value == null) {
						element.toggleAttribute(key, !!value);
					} else {
						element.setAttribute(key, value);
					}
				},
				value
			);

			return this;
		},
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
				mutate(
					element,
					(element, value) => {
						for (let k of key.split(" ")) {
							element.classList.toggle(k, value);
						}
					},
					value
				);
			}

			return this;
		},
		styles(styles) {
			for (let [key, value] of Object.entries(styles)) {
				mutate(
					element,
					(element, value) => {
						element.style.setProperty(key, value);
					},
					value
				);
			}

			return this;
		},
		data(data) {
			for (let [key, value] of Object.entries(data)) {
				mutate(
					element,
					(element, value) => {
						element.dataSet[key] = value;
					},
					value
				);
			}

			return this;
		},
		on(events, handler, options = {}) {
			let el = element.deref();

			if (el) {
				for (let event of [].concat(events)) {
					el.addEventListener(event, handler, options);
				}
			}

			return this;
		},
		nodes(...children) {
			children = children.flat(Infinity);

			for (let child of children) {
				if (typeof child === "function") {
					child = [child];
				}

				if (typeof child === "object" && child[Symbol.iterator] != null) {
					let bounds = comments(element);

					mutate(element, () => {
						let [start, end] = bounds();
						let currentChild =
							start && start.nextSibling !== end ? start.nextSibling : null;
						let fragment = new DocumentFragment();

						for (let item of child) {
							if (!currentChild) {
								let result = item();
								result = result?.[ELEMENT]?.deref?.() ?? result;

								if (result != null) {
									fragment.append(result);
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
					let el = element.deref();
					let result = child?.[ELEMENT]?.deref?.() ?? child;

					el.append(result);
				}
			}

			return this;
		},
		text(txt) {
			mutate(
				element,
				(element, txt) => {
					element.textContent = txt;
				},
				txt
			);

			return this;
		},
		shadow(mode = "open") {
			let el = element.deref();

			if (el.shadowRoot) {
				return use(el.shadowRoot);
			}

			el.attachShadow({mode});

			return use(el.shadowRoot);
		},
		find(search) {
			let el = element.deref();
			let results = [];

			for (let result of el.querySelectorAll(search)) {
				results.push(use(result));
			}

			return results;
		},
	};
}

export function h(default_tag, namespace) {
	let fn = (tag) => () => {
		let element = namespace
			? document.createElementNS(namespace, tag)
			: document.createElement(tag);

		return use(element);
	};

	return new Proxy(fn(default_tag), {
		get(_, tag) {
			return fn(tag);
		},
	});
}

export let svg = h("svg", SVG_NAMESPACE);

export let html = h("html");

export function each(list) {
	let mapper;
	let filterer = () => true;
	let views = [];

	return {
		map(m) {
			mapper = m;

			return this;
		},

		filter(f) {
			filterer = f;

			return this;
		},

		*[Symbol.iterator]() {
			let i = 0;

			for (let [index, item] of list.entries()) {
				if (!filterer({item, index})) {
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

				yield () => {
					return mapper(view);
				};

				i++;
			}

			views.splice(i, Infinity);
		},
	};
}

export function define(name, view) {
	customElements.define(
		name,
		class extends HTMLElement {
			watched = watch({});

			connectedCallback() {
				for (let attr of this.attributes) {
					this.watched[attr.name] = attr.value;
				}

				attributeObserver.observe(this, {attributes: true});

				view(use(this), this.watched);
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
	element = element.deref();

	let bounds = [document.createComment(""), document.createComment("")];

	element.append(...bounds);

	bounds = bounds.map((c) => new WeakRef(c));

	return () => bounds.map((b) => b.deref());
}

function mutate(element, callback, value = () => {}) {
	let immediate = typeof value !== "function";
	let cb = () => {
		let el = element.deref();

		if (el && registered.has(el)) {
			callback(el, immediate ? value : value());
		}
	};
	let el = element.deref();

	if (el) {
		registered.add(el);
	}

	if (immediate) {
		cb();
	} else {
		effect(cb);
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
