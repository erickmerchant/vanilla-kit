import {$, html, watch} from "../lib.js";

let {div, button} = html;

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

	$(target).children(
		div()
			.classes("info-panel")
			.children(
				div()
					.classes("flag-count")
					.children(div().children("🚩"), () => state.flagCount),
				div()
					.attr("aria-live", "polite")
					.children(() => ["", "💀", "🎉"][state.playState]),
				div()
					.classes("time")
					.children(div().children("⏱️"), () => state.time)
			),
		div()
			.classes("board")
			.attr("aria-rowcount", height)
			.attr("aria-colcount", width)
			.attr("role", "grid")
			.children(
				...range(height).map((y) =>
					div()
						.attr("role", "row")
						.children(...range(width).map((x) => squareView(x, y)))
				)
			)
	);

	function squareView(x, y) {
		let square = watch({
			x,
			y,
			isFlagged: false,
			isRevealed: false,
			isArmed: false,
			armedAdjacentCount: 0,
		});

		boardMap.set(`${x} ${y}`, square);

		square.btn = button()
			.classes(
				{
					revealed: () => square.isRevealed,
					flagged: () => square.isFlagged,
				},
				...range(8).map((i) => {
					return {
						[`armed-adjacent-count--${i}`]: () =>
							square.armedAdjacentCount === i,
					};
				})
			)
			.attr("aria-label", () => (square.isRevealed ? null : "Hidden"))
			.attr("type", "button")
			.styles({"--column": x + 1, "--row": y + 1})
			.on("click", revealSquare(x, y))
			.on("contextmenu", toggleFlag(x, y))
			.on("keydown", moveFocus(x, y))
			.children(() => {
				if (!square.isRevealed) {
					return square.isFlagged ? "🚩" : "";
				}

				if (square.isFlagged && !square.isArmed) {
					return "❌";
				}

				return square.isArmed ? "💥" : square.armedAdjacentCount || "";
			});

		return div()
			.attr("role", "gridcell")
			.attr("aria-rowindex", y + 1)
			.attr("aria-colindex", x + 1)
			.children(square.btn);
	}

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
				timeInterval = setInterval(updateTime, 500);
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
				let square = boardMap.get(`${x} ${y}`)?.btn?.deref();

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
