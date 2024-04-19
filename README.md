# vanilla-kit

A tiny toolkit for reactivity in vanilla DOM. Less than **1 kB** minified and compressed. Use it from [jsDelivr](https://cdn.jsdelivr.net/gh/erickmerchant/vanilla-kit/lib.min.js) and add it to your import map. See the examples directory for usage.

## API

### `watch` and `effect`

The reactivity API. `watch` will make an object reactive so that any time a property changes any effects that read that prop are rerun. `effect` is for effects that are not part of the DOM. For instance setting localStorage.

If Signals land in browsers in the near future, they will be used as the underlying mechanism of the reactive API.

```javascript
let state = watch({
	name: "World",
});

effect(() => {
	localStorage.setItem("my-state", JSON.stringify(state));
});
```

### `fragment`

`fragment` is used to create dom nodes that will update reactively.

For instance in this example you construct a div that will be created or destroyed based on `state.showHello`.

```javascript
target.append(fragment(() => (state.showHello ? helloView : null)));

function helloView() {
	let div = document.createElement("div");

	div.innerText = "Hello";

	return div;
}
```

### `list`

Reactively creates fragments for items in list.

```javascript
target.append(
	list(myWatchedList, (data) => (data.item.show ? itemView : null))
);

function itemView(data) {
	let div = document.createElement("div");

	div.id = `item-${data.index}`;

	div.innerText = data.item.title;

	return div;
}
```
