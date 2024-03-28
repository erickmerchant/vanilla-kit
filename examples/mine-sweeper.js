import {tags, render, watch, text} from "../lib.js";

let {div, button} = tags.html;

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
	let boardMap = new Map();
	let startTime = null;
	let timeInterval = null;
	let hiddenCount = height * width;
	let adjacentMap = new Map();

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			boardMap.set(
				`${x} ${y}`,
				watch({
					x,
					y,
					isFlagged: false,
					isRevealed: false,
					isArmed: false,
					armedAdjacentCount: 0,
				})
			);
		}
	}

	render(
		[
			div(
				{className: "info-panel"},
				div(
					{className: "flag-count"},
					div({}, "🚩"),
					text(() => state.flagCount)
				),
				div(
					{ariaLive: "polite"},
					text(() => ["", "💀", "🎉"][state.playState])
				),
				div(
					{className: "time"},
					div({}, "⏱️"),
					text(() => state.time)
				)
			),
			div(
				{
					className: "board",
					ariaRowCount: height,
					ariaColCount: width,
					role: "grid",
				},
				range(height).map((y) =>
					div(
						{role: "row"},
						range(width).map((x) => {
							let square = boardMap.get(`${x} ${y}`);
							let className = () => {
								let list = [];

								if (square.isRevealed) {
									list.push("revealed");
								}

								if (square.isFlagged) {
									list.push("flagged");
								}

								for (let i of range(8)) {
									if (square.armedAdjacentCount === i) {
										list.push(`armed-adjacent-count--${i}`);
									}
								}

								return list.join(" ");
							};

							return div(
								{
									role: "gridcell",
									ariaRowIndex: y + 1,
									ariaColIndex: x + 1,
								},
								button(
									{
										className,
										ariaLabel: () => (square.isRevealed ? null : "Hidden"),
										type: "button",
										style: `--column: ${x + 1}; --row: ${y + 1}`,
										onClick: revealSquare(x, y),
										onContextmenu: toggleFlag(x, y),
										onKeydown: moveFocus(x, y),
									},
									text(() => {
										if (!square.isRevealed) {
											return square.isFlagged ? "🚩" : "";
										}

										if (square.isFlagged && !square.isArmed) {
											return "❌";
										}

										return square.isArmed
											? "💥"
											: square.armedAdjacentCount || "";
									})
								)
							);
						})
					)
				)
			),
		],
		target
	);

	function updateTime() {
		state.time = Math.floor((Date.now() - startTime) / 1000);
	}

	function revealSquare(x, y) {
		return () => {
			let square = boardMap.get(`${x} ${y}`);

			if (state.playState !== PLAY_STATES.PLAYING) {
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
						state.playState = PLAY_STATES.WON;

						clearInterval(timeInterval);
					}
				}
			}
		};
	}

	function toggleFlag(x, y) {
		return (e) => {
			let square = boardMap.get(`${x} ${y}`);

			e.preventDefault();

			if (!square.isRevealed) {
				square.isFlagged = !square.isFlagged;

				state.flagCount += square.isFlagged ? -1 : 1;
			}
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
