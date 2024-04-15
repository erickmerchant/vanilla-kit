import {
	html,
	append,
	map,
	text,
	watch,
	attr,
	prop,
	classes,
	styles,
	on,
	mixin,
	$,
	data,
} from "../lib.js";

let {div, button} = html;

mixin({attr, prop, classes, styles, on, append, text, map, data});

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
	let adjacentMap = new Map();

	for (let y = 0; y < height; y++) {
		let row = new Map();

		for (let x = 0; x < width; x++) {
			row.set(
				x,
				watch({
					x,
					y,
					isFlagged: false,
					isRevealed: false,
					isArmed: false,
					danger: 0,
				})
			);
		}

		board.set(y, row);
	}

	$(target).append(
		div()
			.classes("info-panel")
			.append(
				div()
					.classes("flag-count")
					.append(div().text("🚩"))
					.text(() => state.flagCount),
				div()
					.attr("aria-live", "polite")
					.text(() => ["", "💀", "🎉"][state.playState]),
				div()
					.classes("time")
					.append(div().text("⏱️"))
					.text(() => state.time)
			),
		div()
			.classes("board")
			.attr("aria-rowcount", height)
			.attr("aria-colcount", width)
			.attr("role", "grid")
			.map(range(height), (y) =>
				div()
					.attr("role", "row")
					.map(range(width), (x) => squareView(x(), y()))
			)
	);

	function squareView(x, y) {
		let square = board.get(y).get(x);

		return div()
			.attr("role", "gridcell")
			.attr("aria-rowindex", y + 1)
			.attr("aria-colindex", x + 1)
			.append(
				button()
					.data({
						x,
						y,
					})
					.classes(
						{
							revealed: () => square.isRevealed,
							flagged: () => square.isFlagged,
						},
						...range(8).map((i) => {
							return {
								[`armed-adjacent-count--${i}`]: () => square.danger === i,
							};
						})
					)
					.attr("aria-label", () => (square.isRevealed ? null : "Hidden"))
					.attr("type", "button")
					.styles({"--column": x + 1, "--row": y + 1})
					.on("click", () => {
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
					})
					.on("contextmenu", (e) => {
						let square = board.get(y).get(x);

						e.preventDefault();

						if (!square.isRevealed) {
							square.isFlagged = !square.isFlagged;

							state.flagCount += square.isFlagged ? -1 : 1;
						}
					})
					.on("keydown", (e) => {
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
								`[data-y="${y}"][data-x="${x}"]`
							);

							if (square) {
								square.focus();

								break;
							}
						}
					})
					.text(() => {
						if (!square.isRevealed) {
							return square.isFlagged ? "🚩" : "";
						}

						if (square.isFlagged && !square.isArmed) {
							return "❌";
						}

						return square.isArmed ? "💥" : square.danger || "";
					})
			);
	}

	function updateTime() {
		state.time = Math.floor((Date.now() - startTime) / 1000);
	}

	function getAdjacent(x, y) {
		let key = `${x} ${y}`;
		let result = adjacentMap.get(key);

		if (!result) {
			result = [
				[x - 1, y - 1],
				[x, y - 1],
				[x + 1, y - 1],
				[x - 1, y],
				[x + 1, y],
				[x - 1, y + 1],
				[x, y + 1],
				[x + 1, y + 1],
			].reduce((results, [x, y]) => {
				let square = board.get(y)?.get(x);

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
