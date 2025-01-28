import {Element, watch} from "../lib.js";

Element.prototype.observe = function () {
	let el = this.element.deref();

	if (!el) return;

	let attributes = {};

	for (let attr of el.getAttributeNames()) {
		attributes[attr] = el.getAttribute(attr);
	}

	attributes = watch(attributes);

	let queries = {};
	let observer = new MutationObserver((records) => {
		let el = this.element.deref();

		if (el == null) {
			observer.disconnect();

			return;
		}

		for (let record of records) {
			if (record.type === "attributes") {
				attributes[record.attributeName] = el.getAttribute(
					record.attributeName
				);
			}

			if (record.type === "childList") {
				for (let query of Object.keys(queries)) {
					let results = [...el.querySelectorAll(query)].filter((n) =>
						[...record.addedNodes].includes(n)
					);

					if (results.length) {
						queries[query].splice(0, 0, ...results);
					}
				}
			}
		}
	});

	observer.observe(el, {attributes: true, childList: true, subtree: true});

	return {
		attr: (key) => {
			let el = this.element.deref();

			if (!el) return;

			let val = attributes[key];

			if (val == null) {
				val = el.getAttribute(key);

				attributes[key] = val;
			}

			return val;
		},
		find: (query) => {
			let sent = new WeakSet();
			let el = this.element.deref();

			if (!el) return;

			queries[query] = watch([...el.querySelectorAll(query)]);

			return {
				*[Symbol.iterator]() {
					for (let el of queries[query].splice(0, Infinity)) {
						if (!sent.has(el)) {
							yield new Element(el);

							sent.add(el);
						}
					}
				},
			};
		},
	};
};
