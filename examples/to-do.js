import {html, render} from "../lib.js";

export default function todoApp(target) {
	let state = JSON.parse(localStorage.getItem("to-do-app")) ?? {
		showDone: true,
		list: [],
	};
	let dragItem;
	let scheduled = false;

	document.body.addEventListener("dragover", preventDragAway);

	document.body.addEventListener("dragleave", preventDragAway);

	document.body.addEventListener("drop", preventDragAway);

	update();

	function update() {
		localStorage.setItem("to-do-app", JSON.stringify(state));

		if (!scheduled) {
			scheduled = true;

			requestAnimationFrame(() => {
				scheduled = false;

				render(
					html`<h1 class="title">To Do List</h1>
						<input
							class="show-done"
							id="show-done"
							type="checkbox"
							checked=${state.showDone}
							onchange=${(e) => {
								let show = e.target.checked;

								for (let item of state.list) {
									if (item.isDone) {
										item.isEntering = show;
										item.isLeaving = !show;
									}
								}

								state.showDone = show;

								update();
							}} />
						<label for="show-done">Show done</label>
						<input
							class="input-text"
							placeholder="What do you have to do?"
							onkeypress=${(e) => {
								if (e.keyCode === 13) {
									e.preventDefault();

									let text = e.target.value.trim();

									if (!text) {
										return;
									}

									state.list.push({
										text,
										isDone: false,
										isEntering: true,
										isLeaving: false,
									});

									e.target.value = "";

									update();
								}
							}} />
						<ol class="list">
							${state.list.map((item, index) => {
								if (!state.showDone && item.isDone && !item.isLeaving) {
									return null;
								}
								let classes = ["item"];

								if (item.isDone) {
									classes.push("done");
								}

								if (item.isLeaving) {
									classes.push("leaving");
								}

								if (item.isEntering) {
									classes.push("entering");
								}

								if (dragItem === item) {
									classes.push("dragging");
								}

								return html`
									<li
										draggable="true"
										class="${classes.join(" ")}"
										ondragstart=${(e) => {
											dragItem = item;

											e.dataTransfer.effectAllowed = "move";
											// e.dataTransfer.setDragImage(this, e.offsetX, e.offsetY);
										}}
										ondragend=${() => {
											dragItem = null;

											update();
										}}
										ondragenter=${() => {
											if (dragItem != null) {
												let from = state.list.findIndex((t) => t === dragItem);

												state.list.splice(from, 1);
												state.list.splice(index, 0, dragItem);

												update();
											}
										}}
										ondragover=${preventDefault}
										ondragleave=${preventDefault}
										ondrop=${preventDefault}
										onanimationend=${() => {
											item.isLeaving = false;
											item.isEntering = false;

											if (item.isDeleted) {
												state.list.splice(index, 1);
											}

											update();
										}}>
										<input
											type="checkbox"
											id="${`item-${index}`}"
											checked=${item.isDone}
											onchange=${() => {
												if (!state.showDone && item.isDone) {
													item.isLeaving = true;
												}

												item.isDone = !item.isDone;

												update();
											}} />
										<label for="${`item-${index}`}">${item.text}</label>
										<button
											type="button"
											class="delete"
											onclick=${() => {
												item.isLeaving = true;
												item.isDeleted = true;

												update();
											}}>
											<svg viewBox="0 0 16 16">
												<title>Delete</title>
												<path
													d="M4 1 L8 5 L12 1 L15 4 L11 8 L15 12 L12 15 L8 11 L4 15 L1 12 L5 8 L1 4 Z" />
											</svg>
										</button>
									</li>
								`;
							})}
						</ol>`,
					target
				);
			});
		}
	}

	function preventDefault(e) {
		e.preventDefault();
	}

	function preventDragAway(e) {
		if (dragItem != null) {
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
