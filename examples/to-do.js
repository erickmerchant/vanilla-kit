import {html, render} from "../lib.js";

export default function todoApp(target) {
	let defaultState = {
		showDone: true,
		list: [],
	};
	let savedState = localStorage.getItem("to-do-app");
	let parsedState = savedState ? JSON.parse(savedState) : {};
	let state = Object.assign(defaultState, parsedState);

	let hasItems = () => state.list.length > 0;
	let hasDone = () => state.list.some((item) => item.isDone);
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
				localStorage.setItem("to-do-app", JSON.stringify(state));
			}

			return render(
				html`
					<h1 class="title">To Do List</h1>
					<input
						class="show-done"
						id="show-done"
						type="checkbox"
						:checked=${state.showDone}
						@change=${(e) => {
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
					<label for="show-done">Show Done</label>
					<input
						class="new-input"
						placeholder="What do you have to do?"
						@keydown=${(e) => {
							if (e.key === "Enter") {
								e.preventDefault();

								let text = e.target.value.trim();

								if (!text) return;

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
						${state.list.map(itemView)}
					</ol>
					${footerView()}
				`,
				target
			);
		});
	}

	function itemView(item, index) {
		if (!state.showDone && item.isDone && !item.isLeaving) return null;

		return html`
			<li
				class=${[
					item.isEntering ? "entering" : "",
					item.isLeaving ? "leaving" : "",
					item.isDone ? "done" : "",
					dragState.item === item ? "dragging" : "",
				].join(" ")}
				draggable=${state.list.length > 1 ? "true" : null}
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
						let from = state.list.findIndex((t) => t === dragState.item);

						state.list.splice(from, 1);
						state.list.splice(index, 0, dragState.item);

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
						state.list.splice(
							state.list.findIndex((itm) => itm === item),
							1
						);
					}

					update();
				}}>
				<input
					type="checkbox"
					:checked=${item.isDone}
					@change=${() => {
						if (!state.showDone && item.isDone) {
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
					<svg viewBox="0 0 14 14">
						<title>Delete</title>
						<path
							d="M2.5 0.5 Q3 0 3.5 0.5 L7 4 L10.5 0.5 Q11 0 11.5 0.5 L13.5 2.5 Q14 3 13.5 3.5 L10 7 L13.5 10.5 Q14 11 13.5 11.5 L11.5 13.5 Q11 14 10.5 13.5 L7 10 L3.5 13.5 Q3 14 2.5 13.5 L0.5 11.5 Q0 11 0.5 10.5 L4 7 L0.5 3.5 Q0 3 0.5 2.5 Z"></path>
					</svg>
				</button>
			</li>
		`;
	}

	function footerView() {
		if (!hasItems()) return null;

		let doneCount = state.list.filter((item) => item.isDone).length;
		let totalCount = state.list.length;

		return html`
			<footer class="footer">
				<div>${`${doneCount} of ${totalCount} Done`}</div>
				${clearDoneButtonView()}
			</footer>
		`;
	}

	function clearDoneButtonView() {
		if (!hasDone()) return null;

		return html`
			<button
				type="button"
				class="clear-done"
				@click=${() => {
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
