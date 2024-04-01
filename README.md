# html-render

A tiny declarative front-end framework using the builder pattern for defining virtual dom. Also has shallow reactivity. Less than 1.5 kB minified and compressed. Also it's fully tree-shakeable if you use a bundler like rollup.

## Install

Currently it is hosted on JSR. Install with `deno add @erickmerchant/html-render`. See the examples directory for usage.

## Why?

Declarative UI in the form of JSX, tagged template literals, or templates has become the standard, but I think it's fairly limiting in what it can represent. Everything is props and children. In contrast a fluent interface using chained method calls can more closely match the rich DOM methods available. And it's still declarative. Just because it looks like jQuery, it is not updating the DOM. It is building a virtual DOM tree in the same way that JSX is. Plus it's reactivity, because that's the most efficient way to keep the DOM in sync with state and avoid imperative changes in your application. And it's so small that you can use it nearly anywhere.

## Prior Art

- [jQuery](https://github.com/jquery/jquery)
- [HyperScript](https://github.com/hyperhype/hyperscript?tab=readme-ov-file)
- [@vue/reactivity](https://github.com/vuejs/core/tree/main/packages/reactivity)
- [html](https://github.com/yoshuawuyts/html)
