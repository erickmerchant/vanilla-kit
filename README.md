# html-render

A tiny front-end framework using the builder pattern for defining UI. Also has shallow reactivity. Only 1.5 kB minified and compressed. Also it's fully tree-shakeable if you use a bundler like rollup.

Declarative UI in the form of JSX, tagged template literals, or templates has become the standard, but I think it's fairly limiting in what it can represent. Everything is props and children. In contrast a fluent interface using chained method calls can more closely match the rich DOM methods available. And it's still declarative. Just because it looks like imperative code, it is not updating the DOM. It is building a description of the DOM in the same way that JSX is. Plus it's reactive, because that's the most efficient way to keep the DOM in sync with state and avoid imperative changes in your application. And it's so small that you can use it nearly anywhere.

Currently it is hosted on JSR. Install with `deno add @erickmerchant/html-render`. See the examples directory for usage.

## API

### `watch` and `effect`

The reactivity API. `watch` will make an object reactive so that any time a property changes any effects that read that prop are rerun. `effect` is for effects that are not part of the DOM. For instance setting localStorage or something like that.

```javascript
let state = watch({
	hasError: false,
	name: "World"
	list: watch([
		"a",
		"b",
		"c"
	])
})

effect(() => {
	localStorage.setItem("my-state", JSON.stringify(state));
})
```

### `html`, `svg`, and `math`

These three are proxies for getting functions to call to define DOM elements. There are three seperate proxies, because they each have a specific namespace that must be used when creating elements.

For example:

```javascript
import {html} from "@erickmerchant/html-render";

let {div} = html;

div(); // Node {children: [], props: [], name: 'div', namespace: 'http://www.w3.org/1999/xhtml'}
```

### `mixin`

In order to be fully tree-shakeable you must declare what methods you'll use from the builder API.

For instance this will throw an error, because we haven't said we need `classes`.

```javascript
import {html} from "@erickmerchant/html-render";

let {div} = html;

div().classes("my-div");
```

But this will work:

```javascript
import {html, classes, mixin} from "@erickmerchant/html-render";

let {div} = html;

mixin(classes);

div().classes("my-div");
```

In this way you're forced to import nearly everything you'll use — the exceptions being `append` and `text` — but if you use for instance rollup then you won't end up with unused code.

### `node.attr`, `node.prop`, `node.on`, `node.classes`, `node.styles`, and `node.data`

These are part of the builder API, and are all ways of defining props, attributes, and events.

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
	.append(
		button()
			.prop("type", "button")
			.prop("disabled", () => state.disabled)
			.styles({color: () => (state.hasError ? "red" : "green")})
			.on("click", () => {
				console.log("submiting the form");

				state.disabled = true;
			})
			.text("Submit")
	);
```

With the exception of `node.on`, because it already takes a closure as an argument, many of these methods take a function in places where they could also take a literal value. In these cases these become effects that will run again when state changes. It's important to note though that you don't have to use a closure to use state. It's just if you want the attribute or prop to update when state changes.

### `node.append` and `node.text`

`append` and `text` are the two ways of adding children to a node. `append` can add multiple children of nodes or text. `text` adds one or more text children.

For instance in this example you define a paragraph with two child spans. The first with text "hello", and the second with a closure that provides the value from state. When `state.name` updates just that text node's `nodeValue` will update.

```javascript
p().append(
	span().text("hello"),
	span().text(() => state.name)
);
```

Note that if you try to call both `append` and `text`, or `text` multiple times, an error with be thrown.

### `each`, `include`, and `text`

These three function can produce arguments to `node.append`.

With `each` you pass it a watched array, and a function for producing either `null` (skip this element), or either function that produces nodes, or nodes. It's most efficient to provide a function though, so that each item isn't rerendered every single time the array changes. `view` is an object with two properties, `item` and `index`, where `item` is an item from the array, and `index` is its position.

```javascript
ol()
	.append(each(state.list, (view) => {
		if (view.item.show) return liView

		return null
	}))

function liView(view.item) {
	return li().text(view.item)
}

```

`include` is the way to do condition logic. Like with `each` it's ideal to return a function, but if you're testing a single boolean piece of state it's less important.

```javascript
div().append(
	include(() => {
		if (!state.message) return null;

		return p().text(message);
	})
);
```

`text` is just like `node.text`, but it's passed to `append`. If an element just has children that are text nodes use `node.text`. Otherwise use `text` passed to `append`.

### `render`

Once you have defined everything, use `render` to put it into your app or page.

```javascript
render(div().text("I'm a div"), target);
```

`target` can be any DOM element that can have children, but should probably be `document.body` or a `div` in most cases. For the first argument you can also pass an array of nodes.

## Prior Art

- [jQuery](https://github.com/jquery/jquery)
- [HyperScript](https://github.com/hyperhype/hyperscript)
- [@vue/reactivity](https://github.com/vuejs/core/tree/main/packages/reactivity)
- [Solid](https://www.solidjs.com/)
- [html](https://github.com/yoshuawuyts/html)
