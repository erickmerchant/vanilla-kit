# vanilla-kit

A tiny front-end framework using a fluent interface for constructing UI. It also has shallow reactivity. Only **~1.7 kB** minified and compressed. Use or download it from a CDN like [jsDelivr](https://cdn.jsdelivr.net/gh/erickmerchant/vanilla-kit/lib.min.js) and add it to your import map.

## API

### watch(object)

Pass it an object and it returns the object wrapped in a proxy that will track reads of properties in _effects_, and writes/deletions will rerun those _effects_.

```js
let item = watch({
	text,
	isDone: false,
	isEntering: true,
	isLeaving: false,
});
```

### effect(callback)

Pass it a callback to do things that should get rerun when watched objects are changed. It's for things not covered by the element API. Eg. setting localStorage or calling methods on elements. Only read properties that are later changed will trigger a rerun. Internally this same method is used anywhere a callback called an _effect_ is allowed.

```js
effect(() => {
	localStorage.setItem("items", JSON.stringify(items));
});
```

### define()

### use(element)

### html, svg, math

### element.deref()

### element.prop(key, value)

### element.attr(key, value)

### element.classes(...classes)

### element.styles(styles)

### element.aria(attrs)

### element.data(data)

### element.on(events, handler, options = {})

### element.nodes(...children)

### element.text(txt)

### element.shadow(mode = "open")

### element.observe()

### observer.attr(key)

### observer.find(query)

### each(list)

### collection.map(cb)

### collection.filter(cb)


...

## Prior Art

- [jQuery](https://github.com/jquery/jquery)
- [Ender](https://github.com/ender-js/Ender)
- [HyperScript](https://github.com/hyperhype/hyperscript)
- [@vue/reactivity](https://github.com/vuejs/core/tree/main/packages/reactivity)
````
