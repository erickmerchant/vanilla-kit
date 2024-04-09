import {
	html,
	svg,
	append,
	text,
	effect,
	watch,
	map,
	on,
	classes,
	attr,
	prop,
	mixin,
	$,
} from "../lib.js";

let {h1, input, label, ol, li, button, footer, div} = html;

let {title, path} = svg;

mixin({on, classes, attr, prop, append, text, map});

export default function todoApp(target) {
	let state = watch(
		Object.assign(
			{
				showDone: true,
				list: watch([]),
				_dragItem: null,
				_hasItems: () => state.list.length > 0,
				_hasDone: () => state.list.some((item) => item.isDone),
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

	$(document.body).on(["dragover", "dragleave", "drop"], preventDragAway);

	$(target).append(
		h1().classes("title").text("To Do List"),
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
		label().attr("for", "show-done").text("Show Done"),
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
			.map(state.list, (item) => {
				return state.showDone || !item().isDone || item().isLeaving
					? itemView
					: null;
			}),
		() => (state._hasItems() ? footerView : null)
	);

	function itemView(item, index) {
		return li()
			.classes("item", {
				entering: () => item().isEntering,
				leaving: () => item().isLeaving,
				done: () => item().isDone,
				dragging: () => state._dragItem === item(),
			})
			.attr("draggable", () => (state.list.length > 1 ? "true" : null))
			.on("dragstart", (e) => {
				state._dragItem = item();

				e.dataTransfer.effectAllowed = "move";
			})
			.on("dragend", () => {
				state._dragItem = null;
			})
			.on("dragenter", () => {
				if (state._dragItem != null) {
					let from = state.list.findIndex((t) => t === state._dragItem);

					state.list.splice(from, 1);
					state.list.splice(index(), 0, state._dragItem);
				}
			})
			.on(["dragover", "dragleave", "drop"], preventDefault)
			.on("animationend", () => {
				item().isLeaving = false;
				item().isEntering = false;

				if (item().isDeleted) {
					state.list.splice(
						state.list.findIndex((i) => i === item()),
						1
					);
				}
			})
			.append(
				input()
					.attr("type", "checkbox")
					.attr("id", () => `item-${index()}`)
					.prop("checked", () => item().isDone)
					.on("change", () => {
						if (!state.showDone && item().isDone) {
							item().isLeaving = true;
						}

						item().isDone = !item().isDone;
					}),
				label()
					.attr("for", () => `item-${index()}`)
					.text(() => item().text),
				button()
					.attr("type", "button")
					.classes("delete")
					.on("click", () => {
						item().isLeaving = true;
						item().isDeleted = true;
					})
					.append(
						svg()
							.attr("viewBox", "0 0 16 16")
							.append(
								title().text("Delete"),
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
				div().text(() => {
					let doneCount = state.list.filter((item) => item.isDone).length;
					let totalCount = state.list.length;

					return `${doneCount} of ${totalCount} `;
				}, " Done"),
				() => (state._hasDone() ? clearDoneView : null)
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
			.text("Clear Done");
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
