# vanilla-kit

A tiny front-end framework using a fluent interface for constructing UI. Also has shallow reactivity. Only about **1 kB** minified and compressed. Use or download it from [jsDelivr](https://cdn.jsdelivr.net/gh/erickmerchant/vanilla-kit/lib.min.js) and add it to your import map.

## API

### `watch` and `effect`

The reactivity API. `watch` will make an object reactive so that any time a property changes any effects that read that prop are rerun. `effect` is for effects that are not part of the DOM. For instance setting localStorage.

If Signals land in browsers in the near future, they will be used as the underlying mechanism of the reactive API.

```javascript
let state = watch({
	a: 123,
	b: "abc",
});

effect(() => {
	localStorage.setItem("my-state", JSON.stringify(state));
});
```

### `html`, `svg`, and `math`

These three are proxies for getting functions to call to construct DOM elements. There are three seperate proxies, because they each have a specific namespace that must be used when creating elements.

For example:

```javascript
import {html} from "vanilla-kit";

let {div} = html;

div();
```

### `node.attr`, `node.prop`, `node.on`, `node.classes`, `node.styles`, and `node.data`

These are part of the fluent interface, and are all ways of defining props, attributes, and events.

```javascript
form()
	.classes("my-form", {
		error: () => state.hasError,
	})
	.attr("action", () => state.endpoint)
	.attr("method", "POST")
	.data({
		formId: () => state.formId,
	})
	.on("submit", async (e) => {
		e.preventDefault();

		let formData = new FormData(e.currentTarget);

		try {
			await fetch(state.endpoint, {
				method: "POST",
				body: formData,
			});
		} catch (error) {
			state.hasError = true;
		}
	})
	.children(
		button()
			.prop("type", "button")
			.prop("disabled", () => state.disabled)
			.styles({color: () => (state.hasError ? "red" : "green")})
			.on("click", () => {
				state.disabled = true;
			})
			.children("Submit")
	);
```

With the exception of `node.on`, because it already takes a closure as an argument, many of these methods take a function in places where they could also take a literal value. In these cases these become effects that will run again when state changes. It's important to note though that you don't have to use a closure to use state. It's just if you want the attribute or prop to update when state changes.

`node.on` can also take an array as its first argument to attach a handler to multiple events, and it accepts an optional third argument just like addEventListener.

### `node.children`

`children` is the way to add children to a node.

For instance in this example you construct a div with two children. The first is a span with the literal string "hello", and the second a closure that provides a span with a value from state. When `state.name` updates just that place in the DOM will update.

```javascript
div().children(div().children("hello "), () => (state.name ? nameView : null));

function nameView() {
	return span().children(state.name);
}
```

`$`

Alternatively you can use the `$` export. You can pass it multiple elements, and it will wrap each in the same fluent interface of any constructed element. It returns a proxy that will call the fluent methods on each element you passed in. Use `children` in this form once you have constructed everything, to put it into your document. It's not possible to pass dollar wrapped elements to children.

```javascript
$(target).children(div().children("I'm a div"));
```

## Prior Art

- [jQuery](https://github.com/jquery/jquery)
- [Ender](https://github.com/ender-js/Ender)
- [HyperScript](https://github.com/hyperhype/hyperscript)
- [@vue/reactivity](https://github.com/vuejs/core/tree/main/packages/reactivity)
- [Solid](https://www.solidjs.com/)
