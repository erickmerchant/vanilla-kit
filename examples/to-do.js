import {fragment, list, effect, watch} from "vanilla-kit";

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
		document.body.addEventListener(type, preventDragAway);
	}

	let heading1 = document.createElement("h1");

	heading1.className = "title";
	heading1.textContent = "To Do List";

	let showDoneInput = document.createElement("input");

	showDoneInput.className = "show-done";
	showDoneInput.id = "show-done";
	showDoneInput.type = "checkbox";

	effect(() => {
		showDoneInput.checked = state.showDone;
	});

	showDoneInput.addEventListener("change", (e) => {
		let show = e.target.checked;

		for (let item of state.list) {
			if (item.isDone) {
				item.isEntering = show;
				item.isLeaving = !show;
			}
		}

		state.showDone = show;
	});

	let showDoneLabel = document.createElement("label");

	showDoneLabel.htmlFor = "show-done";
	showDoneLabel.textContent = "Show Done";

	let newInput = document.createElement("input");

	newInput.className = "new-input";
	newInput.placeholder = "What do you have to do?";

	newInput.addEventListener("keydown", (e) => {
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
	});

	let todoOl = document.createElement("ol");

	todoOl.className = "list";

	todoOl.append(
		list(state.list, ({item}) => {
			return state.showDone || !item.isDone || item.isLeaving ? itemView : null;
		})
	);

	let footer = fragment(() => (hasItems() ? footerView : null));

	target.append(
		heading1,
		showDoneInput,
		showDoneLabel,
		newInput,
		todoOl,
		footer
	);

	function itemView(data) {
		let listItem = document.createElement("li");

		listItem.className = "item";

		effect(() => {
			listItem.classList.toggle("entering", data.item.isEntering);
		});

		effect(() => {
			listItem.classList.toggle("leaving", data.item.isLeaving);
		});

		effect(() => {
			listItem.classList.toggle("done", data.item.isDone);
		});

		effect(() => {
			listItem.classList.toggle("dragging", dragState.item === data.item);
		});

		effect(() => {
			listItem.draggable = state.list.length > 1 ? "true" : null;
		});

		listItem.addEventListener("dragstart", (e) => {
			dragState.item = data.item;

			e.dataTransfer.effectAllowed = "move";
		});

		listItem.addEventListener("dragend", () => {
			dragState.item = null;
		});

		listItem.addEventListener("dragenter", () => {
			if (dragState.item != null) {
				let from = state.list.findIndex((t) => t === dragState.item);

				state.list.splice(from, 1);
				state.list.splice(data.index, 0, dragState.item);
			}
		});

		for (let type of ["dragover", "dragleave", "drop"]) {
			listItem.addEventListener(type, preventDefault);
		}

		listItem.addEventListener("animationend", () => {
			data.item.isLeaving = false;
			data.item.isEntering = false;

			if (data.item.isDeleted) {
				state.list.splice(
					state.list.findIndex((i) => i === data.item),
					1
				);
			}
		});

		let doneCheckbox = document.createElement("input");

		doneCheckbox.type = "checkbox";

		effect(() => {
			doneCheckbox.checked = data.item.isDone;
		});

		doneCheckbox.addEventListener("change", () => {
			if (!state.showDone && data.item.isDone) {
				data.item.isLeaving = true;
			}

			data.item.isDone = !data.item.isDone;
		});

		let doneLabel = document.createElement("label");

		effect(() => {
			doneCheckbox.id = `item-${data.index}`;
			doneLabel.htmlFor = `item-${data.index}`;
		});

		effect(() => {
			doneLabel.textContent = data.item.text;
		});

		let deleteButton = document.createElement("button");

		deleteButton.type = "button";
		deleteButton.className = "delete";

		deleteButton.addEventListener("click", () => {
			data.item.isLeaving = true;
			data.item.isDeleted = true;
		});

		deleteButton.innerHTML = `<svg viewBox="0 0 16 16">
			<title>Delete</title>
			<path d="M4 1 L8 5 L12 1 L15 4 L11 8 L15 12 L12 15 L8 11 L4 15 L1 12 L5 8 L1 4 Z"></path>
		</svg>`;

		listItem.append(doneCheckbox, doneLabel, deleteButton);

		return listItem;
	}

	function footerView() {
		let footer = document.createElement("footer");

		footer.className = "footer";

		let div = document.createElement("div");

		effect(() => {
			let doneCount = state.list.filter((item) => item.isDone).length;
			let totalCount = state.list.length;

			div.textContent = `${doneCount} of ${totalCount} Done`;
		});

		let clearDone = fragment(() => (hasDone() ? clearDoneView : null));

		footer.append(div, clearDone);

		return footer;
	}

	function clearDoneView() {
		let button = document.createElement("button");

		button.type = "button";
		button.className = "clear-done";

		button.addEventListener("click", () => {
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
		});

		button.textContent = "Clear Done";

		return button;
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
