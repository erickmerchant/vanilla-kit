import {h, render, effect, watch, each, text, include} from "../lib.js";

let {h1, input, label, ol, li, button, footer, div} = h.html;
let {svg, title, path} = h.svg;

export default function todoApp(target) {
	let state = watch(
		JSON.parse(localStorage.getItem("to-do-app")) ?? {
			showDone: true,
			list: [],
		}
	);

	state.list = watch(state.list.map((item) => watch(item)));

	let meta = watch({
		dragItem: null,
		hasItems: false,
		hasDone: false,
	});

	effect(() => {
		meta.hasItems = state.list.length > 0;
	});

	effect(() => {
		meta.hasDone = state.list.find((item) => item.isDone) != null;
	});

	document.body.addEventListener("dragover", preventDragAway);

	document.body.addEventListener("dragleave", preventDragAway);

	document.body.addEventListener("drop", preventDragAway);

	effect(() => {
		localStorage.setItem("to-do-app", JSON.stringify(state));
	});

	render(
		[
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
				.append(
					each(state.list, (view) =>
						state.showDone || !view.item.isDone || view.item.isLeaving
							? li()
									.classes("item", {
										entering: () => view.item.isEntering,
										leaving: () => view.item.isLeaving,
										done: () => view.item.isDone,
										dragging: () => meta.dragItem === view.item,
									})
									.attr("draggable", () =>
										state.list.length > 1 ? "true" : null
									)
									.on("dragstart", (e) => {
										meta.dragItem = view.item;

										e.dataTransfer.effectAllowed = "move";
									})
									.on("dragend", () => {
										meta.dragItem = null;
									})
									.on("dragenter", () => {
										if (meta.dragItem != null) {
											let from = state.list.findIndex(
												(t) => t === meta.dragItem
											);

											state.list.splice(from, 1);
											state.list.splice(view.index, 0, meta.dragItem);
										}
									})
									.on(["dragover", "dragleave", "drop"], preventDefault)
									.on("animationend", () => {
										view.item.isLeaving = false;
										view.item.isEntering = false;

										if (view.item.isDeleted) {
											state.list.splice(
												state.list.findIndex((item) => item === view.item),
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
												if (!state.showDone && view.item.isDone) {
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
									)
							: null
					)
				),
			include(() =>
				meta.hasItems
					? footer()
							.classes("footer")
							.append(
								div().append(
									text(() => {
										let doneCount = state.list.filter(
											(item) => item.isDone
										).length;
										let totalCount = state.list.length;

										return `${doneCount} of ${totalCount} `;
									}),
									" Done"
								),
								include(() =>
									meta.hasDone
										? button()
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
												.text("Clear Done")
										: null
								)
							)
					: null
			),
		],
		target
	);

	function preventDefault(e) {
		e.preventDefault();
	}

	function preventDragAway(e) {
		if (meta.dragItem != null) {
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
