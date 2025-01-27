import {Element, mutate} from "../lib.js";

Element.prototype.text = function (txt) {
	mutate(
		this.element,
		(element, txt) => {
			element.textContent = txt;
		},
		txt
	);

	return this;
};
