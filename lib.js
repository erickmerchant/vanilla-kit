let currentCallback;
let effectScheduled = false;
let effectQueue = [];
let reads = new WeakMap();

export function watch(object) {
	reads.set(object, new Map());

	return new Proxy(object, {set, get});
}

function get(o, key, r) {
	if (currentCallback) {
		let callbacks = reads.get(o).get(key);

		if (!callbacks) {
			callbacks = new Set();
			reads.get(o).set(key, callbacks);
		}

		callbacks.add(currentCallback);
	}

	return Reflect.get(o, key, r);
}

function set(o, key, value, r) {
	let callbacks = reads.get(o).get(key);

	if (callbacks) {
		effectQueue.push(...callbacks);

		if (!effectScheduled) {
			effectScheduled = true;

			setTimeout(() => {
				effectScheduled = false;

				for (let callback of new Set(effectQueue.splice(0, Infinity))) {
					effect(callback);
				}
			}, 0);
		}

		callbacks.clear();
	}

	return Reflect.set(o, key, value, r);
}

export function effect(callback) {
	let prevCallback = currentCallback;

	currentCallback = callback;

	callback();

	currentCallback = prevCallback;
}

function mutation(callback, ...refs) {
	effect(() => {
		let derefs = refs.map((ref) => ref.deref());

		if (derefs.some((arg) => arg == null)) {
			return;
		}

		callback(...derefs);
	});
}

export function list(list, callback) {
	let views = [];
	let end = document.createComment("");
	let frag = new DocumentFragment();

	frag.append(end);

	mutation((end) => {
		for (let index = 0; index < list.length; index++) {
			let item = list[index];
			let view = views[index];

			if (!view) {
				let data = watch({item, index});
				let frag = fragment(callback, [data]);

				views.push({start: new WeakRef(frag.firstChild), data});

				end.before(frag);
			} else {
				let {data} = view;

				if (data.item !== item) {
					data.item = item;
				}

				if (data.index !== index) {
					data.index = index;
				}
			}
		}

		let currentChild = views[list.length]?.start?.deref();

		truncate(currentChild, end);

		views.splice(list.length, Infinity);
	}, ...refAll(end));

	return frag;
}

export function fragment(callback, args = []) {
	let prevResult = null;
	let [start, end] = [document.createComment(""), document.createComment("")];
	let frag = new DocumentFragment();

	frag.append(start, end);

	mutation((start, end) => {
		let currentChild = start.nextSibling;
		let currentResult = callback(...args);
		let newChild;

		if (
			(currentResult == null && prevResult == null) ||
			currentResult === prevResult
		) {
			return;
		} else if (currentResult != null) {
			let unwrappedResult = currentResult(...args);

			if (unwrappedResult != null) {
				newChild = new DocumentFragment();

				let list = [];

				for (let item of [].concat(unwrappedResult)) {
					if (item != null) {
						list.push(item);
					}
				}

				newChild.append(...list);
			}
		}

		if (currentChild?.nextSibling === end && newChild != null) {
			currentChild.replaceWith(newChild);
		} else {
			truncate(currentChild, end);

			if (newChild != null) {
				start.after(newChild);
			}
		}

		prevResult = currentResult;
	}, ...refAll(start, end));

	return frag;
}

function refAll(...args) {
	return args.map((arg) => new WeakRef(arg));
}

function truncate(currentChild, end) {
	while (currentChild) {
		if (currentChild === end) {
			break;
		}

		let nextChild = currentChild.nextSibling;

		currentChild.remove();

		currentChild = nextChild;
	}
}
