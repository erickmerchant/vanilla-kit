import {Element} from "../lib.js";

Element.prototype.shadow = function (mode = "open") {
	let el = this.element.deref();

	if (el) {
		if (el.shadowRoot) {
			return new Element(el.shadowRoot);
		}

		el.attachShadow({mode});

		return new Element(el.shadowRoot);
	}
};
