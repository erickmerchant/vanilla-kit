import {html, render, classes, styles, ref} from "../lib.js";

const PLAY_STATES = {
	PLAYING: 0,
	LOST: 1,
	WON: 2,
};

export default function mineSweeper({height, width, mineCount}, target) {
	let playState = PLAY_STATES.PLAYING;
	let time = 0;
	let flagCount = mineCount;
	let board = new Map();
	let startTime = null;
	let timeInterval = null;
	let hiddenCount = height * width;

	for (let y = 0; y < height; y++) {
		let row = new Map();

		board.set(y, row);

		for (let x = 0; x < width; x++) {
			let square = {
				x,
				y,
				isFlagged: false,
				isRevealed: false,
				isArmed: false,
				danger: 0,
			};

			row.set(x, square);
		}
	}

	update();

	function update() {
		render(
			html`
				<div class="info-panel">
					<div class="flag-count">
						<div>🚩</div>
						${flagCount}
					</div>
					<div aria-live="polite">${["", "💀", "🎉"][playState]}</div>
					<div class="time">
						<div>⏱️</div>
						${time}
					</div>
				</div>
				<div
					class="board"
					aria-rowcount=${height}
					aria-colcount=${width}
					role="grid">
					${Array.from(
						{length: height},
						(_, y) =>
							html`
								<div role="row">
									${Array.from({length: width}, (_, x) => squareView(x, y))}
								</div>
							`
					)}
				</div>
			`,
			target
		);
	}

	function squareView(x, y) {
		let square = board.get(y).get(x);
		square.button = ref();

		return html`
			<div role="gridcell" aria-row-index=${y + 1} aria-col-index=${x + 1}>
				<button
					type="button"
					:ref=${square.button}
					class=${classes({
						flagged: square.isFlagged,
						revealed: square.isRevealed,
						...Array(9)
							.keys()
							.reduce((acc, i) => {
								acc[`armed-adjacent-count--${i}`] = square.danger === i;

								return acc;
							}, {}),
					})}
					style=${styles({"--column": x + 1, "--row": y + 1})}
					aria-label=${square.isRevealed ? null : "Hidden"}
					@click=${() => {
						if (playState !== PLAY_STATES.PLAYING) {
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

							playState = PLAY_STATES.PLAYING;

							startTime = Date.now();
							timeInterval = setInterval(updateTime, 250);
						}

						if (!square.isFlagged) {
							square.isRevealed = true;

							hiddenCount -= 1;

							if (square.isArmed) {
								playState = PLAY_STATES.LOST;

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
									playState = PLAY_STATES.WON;

									clearInterval(timeInterval);
								}
							}

							update();
						}
					}}
					@contextmenu=${(e) => {
						let square = board.get(y).get(x);

						e.preventDefault();

						if (!square.isRevealed) {
							square.isFlagged = !square.isFlagged;

							flagCount += square.isFlagged ? -1 : 1;

							update();
						}
					}}
					@keydown=${(e) => {
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
							let square = board.get(y)?.get?.(x)?.button.current;

							if (square) {
								square.focus();

								break;
							}
						}

						update();
					}}>
					${!square.isRevealed
						? square.isFlagged
							? "🚩"
							: ""
						: square.isFlagged && !square.isArmed
						? "❌"
						: square.isArmed
						? "💥"
						: square.danger || ""}
				</button>
			</div>
		`;
	}

	function updateTime() {
		time = Math.floor((Date.now() - startTime) / 1000);
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

		this.style.setProperty("--inline-size", width);
		this.style.setProperty("--block-size", height);

		mineSweeper({height, width, mineCount}, this);
	}
}

customElements.define("mine-sweeper", MineSweeper);
