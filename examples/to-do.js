import {
	html,
	svg,
	append,
	effect,
	watch,
	map,
	on,
	classes,
	attr,
	prop,
	mixin,
} from "../lib.js";

let {h1, input, label, ol, li, button, footer, div} = html;

let {title, path} = svg;

mixin(on, classes, attr, prop, append, map);

export default function todoApp(target) {
	let state = watch(
		Object.assign(
			{
				showDone: true,
				list: watch([]),
				_dragItem: null,
				_hasItems: false,
				_hasDone: false,
			},
			JSON.parse(localStorage.getItem("to-do-app") ?? "{}", (key, value) => {
				if (key === "list") {
					return watch(
						value.map((item) => {
							return watch(item);
						})
					);
				}

				return value;
			})
		)
	);

	effect(() => {
		state._hasItems = state.list.length > 0;
	});

	effect(() => {
		state._hasDone = state.list.find((item) => item.isDone) != null;
	});

	effect(() => {
		localStorage.setItem(
			"to-do-app",
			JSON.stringify(state, (key, value) => {
				if (key.startsWith("_")) {
					return undefined;
				}

				return value;
			})
		);
	});

	on(document.body, ["dragover", "dragleave", "drop"], preventDragAway);

	append(
		target,
		h1().classes("title").append("To Do List"),
		input()
			.classes("show-done")
			.attr("id", "show-done")
			.attr("type", "checkbox")
			.prop("checked", () => state.showDone)
			.on("change", (e) => {
				let show = e.target.checked;

				for (let item of state.list) {
					if (item.isDone) {
						item.isEntering = show;
						item.isLeaving = !show;
					}
				}

				state.showDone = show;
			}),
		label().attr("for", "show-done").append("Show Done"),
		input()
			.classes("input-text")
			.attr("placeholder", "What do you have to do?")
			.on("keypress", (e) => {
				if (e.keyCode === 13) {
					e.preventDefault();

					let text = e.target.value.trim();

					if (!text) {
						return;
					}

					state.list.push(
						watch({
							text,
							isDone: false,
							isEntering: true,
							isLeaving: false,
						})
					);

					e.target.value = "";
				}
			}),
		ol()
			.classes("list")
			.map(state.list, (ctx) => {
				return state.showDone || !ctx.item.isDone || ctx.item.isLeaving
					? itemView
					: null;
			}),
		() => (state._hasItems ? footerView : null)
	);

	function itemView(ctx) {
		return li()
			.classes("item", {
				entering: () => ctx.item.isEntering,
				leaving: () => ctx.item.isLeaving,
				done: () => ctx.item.isDone,
				dragging: () => state._dragItem === ctx.item,
			})
			.attr("draggable", () => (state.list.length > 1 ? "true" : null))
			.on("dragstart", (e) => {
				state._dragItem = ctx.item;

				e.dataTransfer.effectAllowed = "move";
			})
			.on("dragend", () => {
				state._dragItem = null;
			})
			.on("dragenter", () => {
				if (state._dragItem != null) {
					let from = state.list.findIndex((t) => t === state._dragItem);

					state.list.splice(from, 1);
					state.list.splice(ctx.index, 0, state._dragItem);
				}
			})
			.on(["dragover", "dragleave", "drop"], preventDefault)
			.on("animationend", () => {
				ctx.item.isLeaving = false;
				ctx.item.isEntering = false;

				if (ctx.item.isDeleted) {
					state.list.splice(
						state.list.findIndex((item) => item === ctx.item),
						1
					);
				}
			})
			.append(
				input()
					.attr("type", "checkbox")
					.attr("id", () => `item-${ctx.index}`)
					.prop("checked", () => ctx.item.isDone)
					.on("change", () => {
						if (!state.showDone && ctx.item.isDone) {
							ctx.item.isLeaving = true;
						}

						ctx.item.isDone = !ctx.item.isDone;
					}),
				label()
					.attr("for", () => `item-${ctx.index}`)
					.append(() => ctx.item.text),
				button()
					.attr("type", "button")
					.classes("delete")
					.on("click", () => {
						ctx.item.isLeaving = true;
						ctx.item.isDeleted = true;
					})
					.append(
						svg()
							.attr("viewBox", "0 0 16 16")
							.append(
								title().append("Delete"),
								path().attr(
									"d",
									"M4 1 L8 5 L12 1 L15 4 L11 8 L15 12 L12 15 L8 11 L4 15 L1 12 L5 8 L1 4 Z"
								)
							)
					)
			);
	}

	function footerView() {
		return footer()
			.classes("footer")
			.append(
				div().append(() => {
					let doneCount = state.list.filter((item) => item.isDone).length;
					let totalCount = state.list.length;

					return `${doneCount} of ${totalCount} `;
				}, " Done"),
				() => (state._hasDone ? clearDoneView : null)
			);
	}

	function clearDoneView() {
		return button()
			.attr("type", "button")
			.classes("clear-done")
			.on("click", () => {
				for (let i = state.list.length - 1; i >= 0; i--) {
					let item = state.list[i];

					if (item.isDone) {
						if (state.showDone) {
							item.isLeaving = true;
							item.isDeleted = true;
						} else {
							state.list.splice(i, 1);
						}
					}
				}
			})
			.append("Clear Done");
	}

	function preventDefault(e) {
		e.preventDefault();
	}

	function preventDragAway(e) {
		if (state._dragItem != null) {
			e.preventDefault();
		}
	}
}

export class TodoApp extends HTMLElement {
	constructor() {
		super();

		todoApp(this);
	}
}

customElements.define("to-do-app", TodoApp);
