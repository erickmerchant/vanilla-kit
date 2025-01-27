import {Element, mutate} from "../lib.js";

Element.prototype.styles = function (styles) {
	for (let [key, value] of Object.entries(styles)) {
		mutate(
			this.element,
			(element, value) => {
				element.style.setProperty(key, value);
			},
			value
		);
	}

	return this;
};
