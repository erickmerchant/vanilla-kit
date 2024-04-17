import {effect, watch} from "../lib.js";

const PLAY_STATES = {
	PLAYING: 0,
	LOST: 1,
	WON: 2,
};

export default function mineSweeper({height, width, mineCount}, target) {
	let state = watch({
		playState: PLAY_STATES.PLAYING,
		time: 0,
		flagCount: mineCount,
	});
	let board = new Map();
	let startTime = null;
	let timeInterval = null;
	let hiddenCount = height * width;

	let infoPanel = document.createElement("div");

	infoPanel.className = "info-panel";

	let flagCount = document.createElement("div");
	let flagCountIcon = document.createElement("div");
	let flagCountText = document.createTextNode("");

	flagCount.className = "flag-count";
	flagCountIcon.textContent = "🚩";

	effect(() => {
		flagCountText.nodeValue = state.flagCount;
	});

	flagCount.append(flagCountIcon, flagCountText);

	let playState = document.createElement("div");
	let playStateText = document.createTextNode("");

	playState.ariaLive = "polite";

	effect(() => {
		playStateText.nodeValue = ["", "💀", "🎉"][state.playState];
	});

	playState.append(playStateText);

	let time = document.createElement("div");
	let timeIcon = document.createElement("div");
	let timeText = document.createTextNode("");

	time.className = "time";
	timeIcon.textContent = "⏱️";

	effect(() => {
		timeText.nodeValue = state.time;
	});

	time.append(timeIcon, timeText);

	infoPanel.append(flagCount, playState, time);

	let boardDiv = document.createElement("div");

	boardDiv.className = "board";
	boardDiv.ariaRowCount = height;
	boardDiv.ariaColCount = width;
	boardDiv.role = "grid";

	for (let y = 0; y < height; y++) {
		let row = new Map();

		let rowDiv = document.createElement("div");

		rowDiv.role = "row";

		for (let x = 0; x < width; x++) {
			let square = watch({
				x,
				y,
				isFlagged: false,
				isRevealed: false,
				isArmed: false,
				danger: 0,
			});

			row.set(x, square);

			let gridCell = document.createElement("div");

			gridCell.role = "gridcell";
			gridCell.ariaRowIndex = y + 1;
			gridCell.ariaColIndex = x + 1;

			let cellButton = document.createElement("button");

			cellButton.type = "button";
			cellButton.dataset.x = x;
			cellButton.dataset.y = y;

			effect(() => {
				cellButton.classList.toggle("flagged", square.isFlagged);
			});

			for (let i = 0; i <= 8; i++) {
				effect(() => {
					cellButton.classList.toggle(
						`armed-adjacent-count--${i}`,
						square.danger === i
					);
				});
			}

			effect(() => {
				cellButton.classList.toggle("revealed", square.isRevealed);
				cellButton.ariaLabel = square.isRevealed ? null : "Hidden";
			});

			cellButton.style.setProperty("--column", x + 1);
			cellButton.style.setProperty("--row", y + 1);

			cellButton.addEventListener("click", () => {
				if (state.playState !== PLAY_STATES.PLAYING) {
					return;
				}

				if (hiddenCount === height * width) {
					let armed = [...board.values()]
						.map((row) => [...row.values()])
						.flat()
						.map((s) => ({
							square: s,
							order: s === square ? 2 : Math.random(),
						}));

					armed.sort((a, b) => a.order - b.order);

					armed = armed.splice(0, mineCount);

					for (let {square} of armed) {
						square.isArmed = true;

						for (let adjacent of getAdjacent(square.x, square.y)) {
							adjacent.danger += 1;
						}
					}

					state.playState = PLAY_STATES.PLAYING;

					startTime = Date.now();
					timeInterval = setInterval(updateTime, 250);
				}

				if (!square.isFlagged) {
					square.isRevealed = true;

					hiddenCount -= 1;

					if (square.isArmed) {
						state.playState = PLAY_STATES.LOST;

						clearInterval(timeInterval);

						for (let row of board.values()) {
							for (let square of row.values()) {
								if (!(square.isFlagged && square.isArmed)) {
									square.isRevealed = true;
								}
							}
						}
					} else {
						if (!square.isFlagged && square.danger === 0) {
							let current = getAdjacent(x, y);

							do {
								let next = [];

								for (let square of current) {
									if (!square || square.isRevealed) {
										continue;
									}

									if (!square?.isArmed && !square?.isFlagged) {
										square.isRevealed = true;

										hiddenCount -= 1;

										if (square.danger === 0) {
											next.push(...getAdjacent(square.x, square.y));
										}
									}
								}

								current = next;
							} while (current.length > 0);
						}

						if (hiddenCount === mineCount) {
							state.playState = PLAY_STATES.WON;

							clearInterval(timeInterval);
						}
					}
				}
			});

			cellButton.addEventListener("contextmenu", (e) => {
				let square = board.get(y).get(x);

				e.preventDefault();

				if (!square.isRevealed) {
					square.isFlagged = !square.isFlagged;

					state.flagCount += square.isFlagged ? -1 : 1;
				}
			});

			cellButton.addEventListener("keydown", (e) => {
				let keys = {
					ArrowUp: [[x, y - 1]],
					ArrowDown: [[x, y + 1]],
					ArrowLeft: [
						[x - 1, y],
						[width - 1, y - 1],
					],
					ArrowRight: [
						[x + 1, y],
						[0, y + 1],
					],
				};

				for (let [x, y] of keys?.[e.key] ?? []) {
					let square = target.querySelector(`[data-y="${y}"][data-x="${x}"]`);

					if (square) {
						square.focus();

						break;
					}
				}
			});

			effect(() => {
				if (!square.isRevealed) {
					cellButton.textContent = square.isFlagged ? "🚩" : "";
				} else if (square.isFlagged && !square.isArmed) {
					cellButton.textContent = "❌";
				} else {
					cellButton.textContent = square.isArmed ? "💥" : square.danger || "";
				}
			});

			gridCell.append(cellButton);

			rowDiv.append(gridCell);
		}

		board.set(y, row);

		boardDiv.append(rowDiv);
	}

	target.append(infoPanel, boardDiv);

	function updateTime() {
		state.time = Math.floor((Date.now() - startTime) / 1000);
	}

	function* getAdjacent(x, y) {
		let mods = [-1, 0, 1];

		for (let modX of mods) {
			for (let modY of mods) {
				if (modX === 0 && modY === 0) {
					continue;
				}

				let square = board.get(y + modY)?.get(x + modX);

				if (square) {
					yield square;
				}
			}
		}
	}
}

export class MineSweeper extends HTMLElement {
	constructor() {
		super();

		let width = +this.getAttribute("width");
		let height = +this.getAttribute("height");
		let mineCount = +this.getAttribute("mine-count");

		this.style.setProperty("--width", width);
		this.style.setProperty("--height", height);

		mineSweeper({height, width, mineCount}, this);
	}
}

customElements.define("mine-sweeper", MineSweeper);
