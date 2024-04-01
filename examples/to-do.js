import {
	html,
	svg,
	render,
	effect,
	watch,
	each,
	text,
	include,
	on,
} from "../lib.js";

let {h1, input, label, ol, li, button, footer, div} = html;

let {title, path} = svg;

export default function todoApp(target) {
	let todoView = watch(
		Object.assign(
			{
				showDone: true,
				list: [],
				_dragItem: null,
				_hasItems: false,
				_hasDone: false,
			},
			JSON.parse(localStorage.getItem("to-do-app") ?? "", (key, value) => {
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
		todoView._hasItems = todoView.list.length > 0;
	});

	effect(() => {
		todoView._hasDone = todoView.list.find((item) => item.isDone) != null;
	});

	on(["dragover", "dragleave", "drop"], preventDragAway);

	effect(() => {
		localStorage.setItem(
			"to-do-app",
			JSON.stringify(todoView, (key, value) => {
				if (key.startsWith("_")) {
					return undefined;
				}

				return value;
			})
		);
	});

	render(
		[
			h1().classes("title").text("To Do List"),
			input()
				.classes("show-done")
				.attr("id", "show-done")
				.attr("type", "checkbox")
				.prop("checked", () => todoView.showDone)
				.on("change", (e) => {
					let show = e.target.checked;

					for (let item of todoView.list) {
						if (item.isDone) {
							item.isEntering = show;
							item.isLeaving = !show;
						}
					}

					todoView.showDone = show;
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

						todoView.list.push(
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
				.append(
					each(todoView.list, (view) =>
						todoView.showDone || !view.item.isDone || view.item.isLeaving
							? itemView
							: null
					)
				),
			include(() => (todoView._hasItems ? footerView : null)),
		],
		target
	);

	function itemView(view) {
		return li()
			.classes("item", {
				entering: () => view.item.isEntering,
				leaving: () => view.item.isLeaving,
				done: () => view.item.isDone,
				dragging: () => todoView._dragItem === view.item,
			})
			.attr("draggable", () => (todoView.list.length > 1 ? "true" : null))
			.on("dragstart", (e) => {
				todoView._dragItem = view.item;

				e.dataTransfer.effectAllowed = "move";
			})
			.on("dragend", () => {
				todoView._dragItem = null;
			})
			.on("dragenter", () => {
				if (todoView._dragItem != null) {
					let from = todoView.list.findIndex((t) => t === todoView._dragItem);

					todoView.list.splice(from, 1);
					todoView.list.splice(view.index, 0, todoView._dragItem);
				}
			})
			.on(["dragover", "dragleave", "drop"], preventDefault)
			.on("animationend", () => {
				view.item.isLeaving = false;
				view.item.isEntering = false;

				if (view.item.isDeleted) {
					todoView.list.splice(
						todoView.list.findIndex((item) => item === view.item),
						1
					);
				}
			})
			.append(
				input()
					.attr("type", "checkbox")
					.attr("id", () => `item-${view.index}`)
					.prop("checked", () => view.item.isDone)
					.on("change", () => {
						if (!todoView.showDone && view.item.isDone) {
							view.item.isLeaving = true;
						}

						view.item.isDone = !view.item.isDone;
					}),
				label()
					.attr("for", () => `item-${view.index}`)
					.text(() => view.item.text),
				button()
					.attr("type", "button")
					.classes("delete")
					.on("click", () => {
						view.item.isLeaving = true;
						view.item.isDeleted = true;
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
				div().append(
					text(() => {
						let doneCount = todoView.list.filter((item) => item.isDone).length;
						let totalCount = todoView.list.length;

						return `${doneCount} of ${totalCount} `;
					}),
					" Done"
				),
				include(() => (todoView._hasDone ? clearDoneView : null))
			);
	}

	function clearDoneView() {
		return button()
			.attr("type", "button")
			.classes("clear-done")
			.on("click", () => {
				for (let i = todoView.list.length - 1; i >= 0; i--) {
					let item = todoView.list[i];

					if (item.isDone) {
						if (todoView.showDone) {
							item.isLeaving = true;
							item.isDeleted = true;
						} else {
							todoView.list.splice(i, 1);
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
		if (todoView._dragItem != null) {
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
