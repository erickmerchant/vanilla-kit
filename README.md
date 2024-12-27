# vanilla-kit

A tiny front-end framework using a fluent interface for constructing UI. Also has shallow reactivity. Only about **1.25 kB** minified and compressed. Use or download it from [jsDelivr](https://cdn.jsdelivr.net/gh/erickmerchant/vanilla-kit/lib.min.js) and add it to your import map.

## API

### `watch` and `effect`

The reactivity API. `watch` will make an object reactive so that any time a property changes any effects that read that prop are rerun. `effect` is for effects that are not part of the DOM. For instance setting localStorage. It's also used internally for DOM effects too.

```javascript
let state = watch({
	a: 123,
	b: "abc",
});

effect(() => {
	localStorage.setItem("my-state", JSON.stringify(state));
});
```

### `create`

Create a DOM element.

For example:

```javascript
import {create} from "vanilla-kit";

create("div")
```

### `node.attr`, `node.prop`, `node.on`, `node.classes`, `node.styles`, and `node.data`

These are part of the fluent interface, and are all ways of defining props, attributes, and events.

```javascript
create("form")
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
	.append(
		create("button")
			.prop("type", "button")
			.prop("disabled", () => state.disabled)
			.styles({color: () => (state.hasError ? "red" : "green")})
			.on("click", () => {
				state.disabled = true;
			})
			.text("Submit")
	);
```

With the exception of `node.on`, because it already takes a closure as an argument, many of these methods take a function in places where they could also take a literal value. In these cases these become effects that will run again when state changes. It's important to note though that you don't have to use a closure to use state. It's just if you want the attribute or prop to update when state changes.

`node.on` can also take an array as its first argument to attach a handler to multiple events, and it accepts an optional third argument just like addEventListener.

### `node.append`, '`node.text`, and `node.map`

All the ways to add children. The `node.map` API is not stable yet.

```javascript
create("div").append(create("div").text("hello "), () => (state.name ? nameView : null));

function nameView() {
	return create("span").text(state.name);
}
```

`adopt`

The `adopt` export is used primarily when mounting your view to the DOM.

```javascript
adopt(target).append(create("div").text("I'm a div"));
```

## Prior Art

- [jQuery](https://github.com/jquery/jquery)
- [Ender](https://github.com/ender-js/Ender)
- [HyperScript](https://github.com/hyperhype/hyperscript)
- [@vue/reactivity](https://github.com/vuejs/core/tree/main/packages/reactivity)
- [Solid](https://www.solidjs.com/)
