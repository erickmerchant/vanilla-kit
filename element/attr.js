import {Element, mutate} from "../lib.js";

Element.prototype.attr = function (key, value) {
	mutate(
		this.element,
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
};
