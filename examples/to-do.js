import {
	tags,
	render,
	effect,
	watch,
	each,
	include,
	text,
	attr,
} from "../lib.js";

let {h1, input, label, ol, li, button, footer, div} = tags.html;
let {svg, title, path} = tags.svg;

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
			h1({className: "title"}, "To Do List"),
			input({
				className: "show-done",
				id: "show-done",
				type: "checkbox",
				checked: () => state.showDone,
				onChange: (e) => {
					let show = e.target.checked;

					for (let item of state.list) {
						if (item.isDone) {
							item.isEntering = show;
							item.isLeaving = !show;
						}
					}

					state.showDone = show;
				},
			}),
			label({htmlFor: "show-done"}, "Show done"),
			input({
				className: "input-text",
				placeholder: "What do you have to do?",
				onKeypress: (e) => {
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
				},
			}),
			ol(
				{className: "list"},
				each(state.list, (view) => {
					if (!state.showDone && view.item.isDone && !view.item.isLeaving) {
						return null;
					}

					let className = () => {
						let list = ["item"];

						if (view.item.isDone) {
							list.push("done");
						}

						if (view.item.isLeaving) {
							list.push("leaving");
						}

						if (view.item.isEntering) {
							list.push("entering");
						}

						if (meta.dragItem === view.item) {
							list.push("dragging");
						}

						return list.join(" ");
					};

					return li(
						{
							className,
							draggable: () => (state.list.length > 1 ? "true" : null),
							onDragstart: (e) => {
								meta.dragItem = view.item;

								e.dataTransfer.effectAllowed = "move";
							},
							onDragend: () => {
								meta.dragItem = null;
							},
							onDragenter: () => {
								if (meta.dragItem != null) {
									let from = state.list.findIndex((t) => t === meta.dragItem);

									state.list.splice(from, 1);
									state.list.splice(view.index, 0, meta.dragItem);
								}
							},
							onDragover: preventDefault,
							onDragleave: preventDefault,
							onDrop: preventDefault,
							onAnimationend: () => {
								view.item.isLeaving = false;
								view.item.isEntering = false;

								if (view.item.isDeleted) {
									state.list.splice(
										state.list.findIndex((item) => item === view.item),
										1
									);
								}
							},
						},
						input({
							type: "checkbox",
							id: () => `item-${view.index}`,
							checked: () => view.item.isDone,
							onChange: () => {
								if (!state.showDone && view.item.isDone) {
									view.item.isLeaving = true;
								}

								view.item.isDone = !view.item.isDone;
							},
						}),
						label(
							{htmlFor: () => `item-${view.index}`},
							text(() => view.item.text)
						),
						button(
							{
								type: "button",
								className: "delete",
								onClick: () => {
									view.item.isLeaving = true;
									view.item.isDeleted = true;
								},
							},
							svg(
								{viewBox: attr("0 0 16 16")},
								title({}, "Delete"),
								path({
									d: attr(
										"M4 1 L8 5 L12 1 L15 4 L11 8 L15 12 L12 15 L8 11 L4 15 L1 12 L5 8 L1 4 Z"
									),
								})
							)
						)
					);
				})
			),
			include(() =>
				meta.hasItems
					? footer(
							{className: "footer"},
							div(
								{},
								text(() => {
									let doneCount = state.list.filter(
										(item) => item.isDone
									).length;
									let totalCount = state.list.length;

									return `${doneCount} of ${totalCount} `;
								}),
								" Done"
							),
							include(() => {
								if (!meta.hasDone) {
									return null;
								}

								return button(
									{
										type: "button",
										className: "clear-done",
										onClick: () => {
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
										},
									},
									"Clear Done"
								);
							})
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
