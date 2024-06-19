import {html, render} from "../lib.js";

export default function todoApp(target) {
	let defaultState = {
		showDone: true,
		list: [],
	};
	let savedState = localStorage.getItem("to-do-app");
	let parsedState = savedState ? JSON.parse(savedState) : {};
	let {showDone, list} = Object.assign(defaultState, parsedState);

	let hasItems = () => list.length > 0;
	let hasDone = () => list.some((item) => item.isDone);
	let dragState = {item: null};

	for (let type of ["dragover", "dragleave", "drop"]) {
		document.body.addEventListener(type, (e) => {
			if (dragState.item != null) {
				e.preventDefault();
			}
		});
	}

	update();

	function update() {
		window.requestAnimationFrame(() => {
			if (globalThis.localStorage) {
				localStorage.setItem("to-do-app", JSON.stringify({showDone, list}));
			}

			render(
				html`
					<h1 class="title">To Do List</h1>
					<input
						class="show-done"
						id="show-done"
						type="checkbox"
						.checked=${showDone}
						@change=${(e) => {
							let show = e.target.checked;

							for (let item of list) {
								if (item.isDone) {
									item.isEntering = show;
									item.isLeaving = !show;
								}
							}

							showDone = show;

							update();
						}} />
					<label for="show-done">Show Done</label>
					<input
						class="new-input"
						placeholder="What do you have to do?"
						@keydown=${(e) => {
							if (e.key === "Enter") {
								e.preventDefault();

								let text = e.target.value.trim();

								if (!text) return;

								list.push({
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
						${list.map(itemView)}
					</ol>
					${footerView()}
				`,
				target
			);
		});
	}

	function itemView(item, index) {
		if (!showDone && item.isDone && !item.isLeaving) return;

		return html`
			<li
				class=${[
					item.isEntering ? "entering" : "",
					item.isLeaving ? "leaving" : "",
					item.isDone ? "done" : "",
					dragState.item === item ? "dragging" : "",
				].join(" ")}
				draggable=${list.length > 1 ? "true" : null}
				@dragstart=${(e) => {
					dragState.item = item;

					e.dataTransfer.effectAllowed = "move";

					update();
				}}
				@dragend=${() => {
					dragState.item = null;

					update();
				}}
				@dragenter=${() => {
					if (dragState.item != null) {
						let from = list.findIndex((t) => t === dragState.item);

						list.splice(from, 1);
						list.splice(index, 0, dragState.item);

						update();
					}
				}}
				@dragover=${(e) => {
					e.preventDefault();
				}}
				@dragleave=${(e) => {
					e.preventDefault();
				}}
				@drop=${(e) => {
					e.preventDefault();
				}}
				@animationend=${() => {
					item.isLeaving = false;
					item.isEntering = false;

					if (item.isDeleted) {
						list.splice(
							list.findIndex((itm) => itm === item),
							1
						);
					}

					update();
				}}>
				<input
					type="checkbox"
					.checked=${item.isDone}
					@change=${() => {
						if (!showDone && item.isDone) {
							item.isLeaving = true;
						}

						item.isDone = !item.isDone;

						update();
					}}
					id=${`item-${index}`} />
				<label for=${`item-${index}`}>${item.text}</label>
				<button
					type="button"
					class="delete"
					@click=${() => {
						item.isLeaving = true;
						item.isDeleted = true;

						update();
					}}>
					<svg viewBox="0 0 28 28">
						<title>Delete</title>
						<path
							d="M5 1 Q6 0 7 1 L14 8 L21 1 Q22 0 23 1 L27 5 Q28 6 27 7 L20 14 L27 21 Q28 22 27 23 L23 27 Q22 28 21 27 L14 20 L7 27 Q6 28 5 27 L1 23 Q0 22 1 21 L8 14 L1 7 Q0 6 1 5 Z" />
					</svg>
				</button>
			</li>
		`;
	}

	function footerView() {
		if (!hasItems()) return;

		let doneCount = list.filter((item) => item.isDone).length;
		let totalCount = list.length;

		return html`
			<footer class="footer">
				<div>${`${doneCount} of ${totalCount} Done`}</div>
				${clearDoneButtonView()}
			</footer>
		`;
	}

	function clearDoneButtonView() {
		if (!hasDone()) return;

		return html`
			<button
				type="button"
				class="clear-done"
				@click=${() => {
					for (let i = list.length - 1; i >= 0; i--) {
						let item = list[i];

						if (item.isDone) {
							if (showDone) {
								item.isLeaving = true;
								item.isDeleted = true;
							} else {
								list.splice(i, 1);
							}
						}
					}

					update();
				}}>
				Clear Done
			</button>
		`;
	}
}

export class TodoApp extends HTMLElement {
	constructor() {
		super();

		todoApp(this);
	}
}

customElements.define("to-do-app", TodoApp);
