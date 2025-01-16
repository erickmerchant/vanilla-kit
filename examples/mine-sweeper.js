import {watch, html, define, effect} from "../lib.js";

let {div, button} = html;

const PLAY_STATES = {
	PLAYING: 0,
	LOST: 1,
	WON: 2,
};

export default function mineSweeper(host, attributes) {
	let height = +attributes.height;
	let width = +attributes.width;
	let mineCount = +attributes["mine-count"];
	let state = watch({
		playState: PLAY_STATES.PLAYING,
		time: 0,
		flagCount: mineCount,
		hasFocus: [],
	});
	let startTime = null;
	let timeInterval = null;
	let hiddenCount = height * width;
	let gameBoard = new Map();
	let adjacentMap = new Map();

	let infoPanel = div()
		.classes("info-panel")
		.nodes(
			div().text(() => `🚩 ${state.flagCount}`),
			div()
				.attr("aria-live", "polite")
				.text(() => ["", "💀", "🎉"][state.playState]),
			div().text(() => `⏱️ ${state.time}`)
		);
	let board = div()
		.attr("aria-rowcount", height)
		.attr("aria-colcount", width)
		.attr("role", "grid")
		.nodes(
			range(height).map((row) =>
				div()
					.attr("role", "row")
					.nodes(range(width).map((col) => cell(row, col)))
			)
		);

	host.styles({
		"--width": width,
		"--height": height,
	});

	host.shadow("open").nodes(infoPanel, board);

	function cell(row, col) {
		let square = watch({
			x: col,
			y: row,
			isFlagged: false,
			isRevealed: false,
			isArmed: false,
			armedAdjacentCount: 0,
		});

		gameBoard.set(`${col} ${row}`, square);

		let btn = button()
			.attr("type", "button")
			.styles({
				"--column": col + 1,
				"--row": row + 1,
			})
			.attr("aria-label", () => (square.isRevealed ? null : "Hidden"))
			.classes({
				revealed: () => square.isRevealed,
				flagged: () => square.isFlagged,
				...range(8).reduce((classes, i) => {
					classes[`armed-adjacent-count--${i}`] = () =>
						square.armedAdjacentCount === i;

					return classes;
				}, {}),
			})
			.on("click", revealSquare(col, row))
			.on("contextmenu", toggleFlag(col, row))
			.on("keydown", moveFocus(col, row))
			.text(() => {
				if (!square.isRevealed) {
					return square.isFlagged ? "🚩" : "";
				} else {
					return square.isFlagged && !square.isArmed
						? "❌"
						: square.isArmed
							? "💥"
							: square.armedAdjacentCount || "";
				}
			});

		effect(() => {
			if (state.hasFocus?.[0] === col && state.hasFocus?.[1] === row) {
				btn.deref().focus();
			}
		});

		return div()
			.attr("role", "gridcell")
			.attr("aria-rowindex", row)
			.attr("aria-colindex", col)
			.nodes(btn);
	}

	function updateTime() {
		state.time = Math.floor((Date.now() - startTime) / 1000);
	}

	function revealSquare(x, y) {
		return () => {
			let square = gameBoard.get(`${x} ${y}`);

			if (state.playState !== PLAY_STATES.PLAYING) {
				return;
			}

			if (hiddenCount === height * width) {
				let armed = [...gameBoard.values()].map((s) => ({
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

					for (let square of gameBoard.values()) {
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
			let square = gameBoard.get(`${x} ${y}`);

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
				ArrowUp: y > 0 ? [x, y - 1] : [],
				ArrowDown: y < height - 1 ? [x, y + 1] : [],
				ArrowLeft: x > 0 ? [x - 1, y] : y > 0 ? [width - 1, y - 1] : [],
				ArrowRight:
					x < width - 1 ? [x + 1, y] : y < height - 1 ? [0, y + 1] : [],
			};

			state.hasFocus = keys?.[e.key] ?? [];
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
				let square = gameBoard.get(key);

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

define("mine-sweeper", mineSweeper);

function range(n) {
	return [...Array(n).keys()];
}
