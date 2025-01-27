import {Element, mutate} from "../lib.js";

Element.prototype.prop = function (key, value) {
	mutate(
		this.element,
		(element, value) => {
			element[key] = value;
		},
		value
	);

	return this;
};
