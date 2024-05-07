import {fragment, list, effect, watch, create, html, svg} from "../lib.js";

export default function todoApp(target) {
	let defaultState = {
		showDone: true,
		list: [],
	};
	let savedState = localStorage.getItem("to-do-app");
	let parsedState = savedState ? JSON.parse(savedState) : {};
	let state = watch(Object.assign(defaultState, parsedState));

	state.list = watch(state.list.map((item) => watch(item)));

	let hasItems = () => state.list.length > 0;
	let hasDone = () => state.list.some((item) => item.isDone);
	let dragState = watch({item: null});

	effect(() => {
		if (globalThis.localStorage) {
			localStorage.setItem("to-do-app", JSON.stringify(state));
		}
	});

	for (let type of ["dragover", "dragleave", "drop"]) {
		document.body.addEventListener(type, (e) => {
			if (dragState.item != null) {
				e.preventDefault();
			}
		});
	}

	target.append(
		create(html`
			<h1 class="title">To Do List</h1>
			<input
				class="show-done"
				id="show-done"
				type="checkbox"
				:checked=${() => state.showDone}
				@change=${(e) => {
					let show = e.target.checked;

					for (let item of state.list) {
						if (item.isDone) {
							item.isEntering = show;
							item.isLeaving = !show;
						}
					}

					state.showDone = show;
				}} />
			<label for="show-done">Show Done</label>
			<input
				class="new-input"
				placeholder="What do you have to do?"
				@keydown=${(e) => {
					if (e.key === "Enter") {
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
				}} />
			<ol class="list">
				${list(state.list, ({item}) => {
					return state.showDone || !item.isDone || item.isLeaving
						? itemView
						: null;
				})}
			</ol>
			${fragment(() => (hasItems() ? footerView : null))}
		`)
	);

	function itemView(data) {
		return html`
			<li
				class=${() => {
					let classes = ["item"];

					if (data.item.isEntering) {
						classes.push("entering");
					}

					if (data.item.isLeaving) {
						classes.push("leaving");
					}

					if (data.item.isDone) {
						classes.push("done");
					}

					if (dragState.item === data.item) {
						classes.push("dragging");
					}

					return classes.join(" ");
				}}
				draggable=${() => (state.list.length > 1 ? "true" : null)}
				@dragstart=${(e) => {
					dragState.item = data.item;

					e.dataTransfer.effectAllowed = "move";
				}}
				@dragend=${() => {
					dragState.item = null;
				}}
				@dragenter=${() => {
					if (dragState.item != null) {
						let from = state.list.findIndex((t) => t === dragState.item);

						state.list.splice(from, 1);
						state.list.splice(data.index, 0, dragState.item);
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
					data.item.isLeaving = false;
					data.item.isEntering = false;

					if (data.item.isDeleted) {
						state.list.splice(
							state.list.findIndex((i) => i === data.item),
							1
						);
					}
				}}>
				<input
					type="checkbox"
					:checked=${() => data.item.isDone}
					@change=${() => {
						if (!state.showDone && data.item.isDone) {
							data.item.isLeaving = true;
						}

						data.item.isDone = !data.item.isDone;
					}}
					id=${`item-${data.index}`} />
				<label for=${`item-${data.index}`}>${() => data.item.text}</label>
				<button
					type="button"
					class="delete"
					@click=${() => {
						data.item.isLeaving = true;
						data.item.isDeleted = true;
					}}>
					${svg`
						<svg viewBox="0 0 14 14">
							<title>Delete</title>
							<path d="M3 0 L7 4 L11 0 L14 3 L10 7 L14 11 L11 14 L7 10 L3 14 L0 11 L4 7 L0 3 Z" />
						</svg>
					`}
				</button>
			</li>
		`;
	}

	function footerView() {
		return html`
			<footer class="footer">
				<div>
					${() => {
						let doneCount = state.list.filter((item) => item.isDone).length;
						let totalCount = state.list.length;

						return `${doneCount} of ${totalCount} Done`;
					}}
				</div>
				${fragment(() => (hasDone() ? clearDoneView : null))}
			</footer>
		`;
	}

	function clearDoneView() {
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
