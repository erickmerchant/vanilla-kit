import {html, render, effect, watch, each} from "../lib.js";

export default function todoApp(target) {
	let state = watch(
		JSON.parse(localStorage.getItem("to-do-app")) ?? {
			showDone: true,
			list: [],
		}
	);
	let dragState = watch({
		item: null,
	});

	state.list = watch(state.list.map((item) => watch(item)));

	document.body.addEventListener("dragover", preventDragAway);

	document.body.addEventListener("dragleave", preventDragAway);

	document.body.addEventListener("drop", preventDragAway);

	effect(() => {
		localStorage.setItem("to-do-app", JSON.stringify(state));
	});

	render(
		html`<h1 class="title">To Do List</h1>
			<input
				class="show-done"
				id="show-done"
				type="checkbox"
				checked=${() => state.showDone}
				onchange=${(e) => {
					let show = e.target.checked;

					for (let item of state.list) {
						if (item.isDone) {
							item.isEntering = show;
							item.isLeaving = !show;
						}
					}

					state.showDone = show;
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
				${each(state.list, (item) => {
					if (!state.showDone && item.isDone && !item.isLeaving) {
						return null;
					}

					return liView;
				})}
			</ol>`,
		target
	);

	function liView(view) {
		let classes = () => {
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

			if (dragState.item === view.item) {
				list.push("dragging");
			}

			return list.join(" ");
		};

		return html`
			<li
				draggable="true"
				class="${classes}"
				ondragstart=${(e) => {
					dragState.item = view.item;

					e.dataTransfer.effectAllowed = "move";
				}}
				ondragend=${() => {
					dragState.item = null;
				}}
				ondragenter=${() => {
					if (dragState.item != null) {
						let from = state.list.findIndex((t) => t === dragState.item);

						state.list.splice(from, 1);
						state.list.splice(view.index, 0, dragState.item);
					}
				}}
				ondragover=${preventDefault}
				ondragleave=${preventDefault}
				ondrop=${preventDefault}
				onanimationend=${() => {
					view.item.isLeaving = false;
					view.item.isEntering = false;

					if (view.item.isDeleted) {
						state.list.splice(
							state.list.findIndex((item) => item === view.item),
							1
						);
					}
				}}>
				<input
					type="checkbox"
					id="item-${() => view.index}"
					checked=${() => view.item.isDone}
					onchange=${() => {
						if (!state.showDone && view.item.isDone) {
							view.item.isLeaving = true;
						}

						view.item.isDone = !view.item.isDone;
					}} />
				<label for="item-${() => view.index}">${() => view.item.text}</label>
				<button
					type="button"
					class="delete"
					onclick=${() => {
						view.item.isLeaving = true;
						view.item.isDeleted = true;
					}}>
					<svg viewBox="0 0 16 16">
						<title>Delete</title>
						<path
							d="M4 1 L8 5 L12 1 L15 4 L11 8 L15 12 L12 15 L8 11 L4 15 L1 12 L5 8 L1 4 Z" />
					</svg>
				</button>
			</li>
		`;
	}

	function preventDefault(e) {
		e.preventDefault();
	}

	function preventDragAway(e) {
		if (dragState.item != null) {
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
