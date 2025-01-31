import {Element} from "../dom.js";
import {mutate} from "../reactivity.js";

Element.prototype.classes = function (...classes) {
	classes = classes.flat(Infinity);

	for (let c of classes) {
		if (typeof c !== "object") {
			c = {[c]: true};
		}

		for (let [key, value] of Object.entries(c)) {
			mutate(
				this.element,
				(element, value) => {
					for (let k of key.split(" ")) {
						element.classList.toggle(k, value);
					}
				},
				value
			);
		}
	}

	return this;
};
