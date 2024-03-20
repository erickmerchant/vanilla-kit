import {html, render} from "../lib.js";

const PLAY_STATES = {
	PLAYING: 0,
	LOST: 1,
	WON: 2,
};

export default function mineSweeper({height, width, mineCount}, target) {
	let playState = PLAY_STATES.PLAYING;
	let time = 0;
	let flagCount = mineCount;
	let boardMap = new Map();
	let startTime = null;
	let timeInterval = null;
	let hiddenCount = height * width;
	let adjacentMap = new Map();

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			boardMap.set(`${x} ${y}`, {
				x,
				y,
				isFlagged: false,
				isRevealed: false,
				isArmed: false,
				armedAdjacentCount: 0,
			});
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
					aria-row-count="${height}"
					aria-col-count="${width}"
					role="grid">
					${range(height).map(
						(y) => html`
							<div role="row">
								${range(width).map((x) => {
									let square = boardMap.get(`${x} ${y}`);
									let classes = [];

									if (square.isRevealed) {
										classes.push("revealed");
									}

									if (square.isFlagged) {
										classes.push("flagged");
									}

									for (let i of range(8)) {
										if (square.armedAdjacentCount === i) {
											classes.push(`armed-adjacent-count--${i}`);
										}
									}

									return html`
											<div role="gridcell" aria-rowindex="${y + 1}" aria-colindex="${x + 1}">
												<button
													aria-label="${square.isRevealed ? null : "Hidden"}"
													type="button"
													style="--column: ${x + 1}; --row: ${y + 1}"
													class="${classes.join(" ")}"
													onclick=${revealSquare(x, y)}
													oncontextmenu=${toggleFlag(x, y)}
													onkeydown=${moveFocus(x, y)}>
													${
														!square.isRevealed
															? square.isFlagged
																? "🚩"
																: ""
															: square.isFlagged && !square.isArmed
															? "❌"
															: square.isArmed
															? "💥"
															: square.armedAdjacentCount || ""
													}
											</div>
										`;
								})}
							</div>
						`
					)}
				</div>
			`,
			target
		);
	}

	function updateTime() {
		time = Math.floor((Date.now() - startTime) / 1000);

		update();
	}

	function revealSquare(x, y) {
		return () => {
			let square = boardMap.get(`${x} ${y}`);

			if (playState !== PLAY_STATES.PLAYING) {
				return;
			}

			if (hiddenCount === height * width) {
				let armed = [...boardMap.values()].map((s) => ({
					square: s,
					order: s === square ? 2 : Math.random(),
				}));

				armed.sort((a, b) => a.order - b.order);

				armed = armed.splice(0, mineCount);

				for (let {square} of armed) {
					square.isArmed = true;

					for (let adjacent of getAdjacent(square.x, square.y)) {
						adjacent.armedAdjacentCount += 1;
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

					for (let square of boardMap.values()) {
						if (!(square.isFlagged && square.isArmed)) {
							square.isRevealed = true;
						}
					}
				} else {
					if (!square.isFlagged && square.armedAdjacentCount === 0) {
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

									if (square.armedAdjacentCount === 0) {
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
			}

			update();
		};
	}

	function toggleFlag(x, y) {
		return (e) => {
			let square = boardMap.get(`${x} ${y}`);

			e.preventDefault();

			if (!square.isRevealed) {
				square.isFlagged = !square.isFlagged;

				flagCount += square.isFlagged ? -1 : 1;
			}

			update();
		};
	}

	function moveFocus(x, y) {
		return (e) => {
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
				let square = target.querySelector(
					`[role="row"]:nth-child(${y + 1}) [role="gridcell"]:nth-child(${
						x + 1
					}) button`
				);

				if (square) {
					square.focus();

					break;
				}
			}
		};
	}

	function getAdjacent(x, y) {
		let key = `${x} ${y}`;
		let result = adjacentMap.get(key);

		if (!result) {
			result = [
				`${x - 1} ${y - 1}`,
				`${x} ${y - 1}`,
				`${x + 1} ${y - 1}`,
				`${x - 1} ${y}`,
				`${x + 1} ${y}`,
				`${x - 1} ${y + 1}`,
				`${x} ${y + 1}`,
				`${x + 1} ${y + 1}`,
			].reduce((results, key) => {
				let square = boardMap.get(key);

				if (square) {
					results.push(square);
				}

				return results;
			}, []);

			adjacentMap.set(key, result);
		}

		return result;
	}
}

function range(n) {
	return [...Array(n).keys()];
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
