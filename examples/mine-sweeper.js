import {watch, create, each, define, effect} from "../lib.js";

const PLAY_STATES = {
	PLAYING: 0,
	LOST: 1,
	WON: 2,
};

export default function mineSweeper(attributes) {
	effect(() => {
		console.log(attributes.width, attributes.height);
	});

	let state = watch({
		playState: PLAY_STATES.PLAYING,
		time: 0,
		flagCount: attributes.mineCount,
	});
	let startTime = null;
	let timeInterval = null;
	let hiddenCount = attributes.height * attributes.width;
	let gameBoard = new Map();
	let adjacentMap = new Map();
	let infoPanel = create("div")
		.classes("info-panel")
		.append(
			create("div")
				.classes("flag-count")
				.append(create("div").text("🚩"), () => state.flagCount),
			create("div")
				.attr("aria-live", "polite")
				.text(() => ["", "💀", "🎉"][state.playState]),
			create("div")
				.classes("time")
				.append(create("div").text("⏱️"), () => state.time)
		);
	let board = create("div")
		.attr("aria-rowcount", attributes.height)
		.attr("aria-colcount", attributes.width)
		.attr("role", "grid")
		.append(
			each(range(attributes.height)).map((row) =>
				create("div")
					.attr("role", "row")
					.append(each(range(attributes.width)).map((col) => cell(row, col)))
			)
		);

	function cell(row, col) {
		let square = watch({
			x: col.index,
			y: row.index,
			isFlagged: false,
			isRevealed: false,
			isArmed: false,
			armedAdjacentCount: 0,
		});

		gameBoard.set(`${col.index} ${row.index}`, square);

		return create("div")
			.attr("role", "gridcell")
			.attr("aria-rowindex", row.index)
			.attr("aria-colindex", col.index)
			.append(
				create("button")
					.attr("type", "button")
					.styles({
						"--column": col.index + 1,
						"--row": row.index + 1,
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
					.on("click", revealSquare(col.index, row.index))
					.on("contextmenu", toggleFlag(col.index, row.index))
					.on("keydown", moveFocus(col.index, row.index))
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
					})
			);
	}

	this.styles({
		"--width": attributes.width,
		"--height": attributes.height,
	});

	return [infoPanel, board];

	function updateTime() {
		state.time = Math.floor((Date.now() - startTime) / 1000);
	}

	function revealSquare(x, y) {
		return () => {
			let square = gameBoard.get(`${x} ${y}`);

			if (state.playState !== PLAY_STATES.PLAYING) {
				return;
			}

			if (hiddenCount === attributes.height * attributes.width) {
				let armed = [...gameBoard.values()].map((s) => ({
					square: s,
					order: s === square ? 2 : Math.random(),
				}));

				armed.sort((a, b) => a.order - b.order);

				armed = armed.splice(0, attributes.mineCount);

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

					if (hiddenCount === attributes.mineCount) {
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
				ArrowUp: [[x, y - 1]],
				ArrowDown: [[x, y + 1]],
				ArrowLeft: [
					[x - 1, y],
					[attributes.width - 1, y - 1],
				],
				ArrowRight: [
					[x + 1, y],
					[0, y + 1],
				],
			};

			for (let [x, y] of keys?.[e.key] ?? []) {
				let square = target.element
					?.deref()
					?.querySelector(
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
