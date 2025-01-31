let current;
let queue = [];
let reads = new WeakMap();
let registered = new WeakSet();
let scheduled = false;

function get(o, key, r) {
	if (current) {
		let callbacks = reads.get(o).get(key);

		if (!callbacks) {
			callbacks = new Set();
			reads.get(o).set(key, callbacks);
		}

		callbacks.add(current);
	}

	return Reflect.get(o, key, r);
}

function modify(o, key) {
	let callbacks = reads.get(o).get(key);

	if (callbacks) {
		for (let cb of callbacks) {
			effect(cb);
		}

		callbacks.clear();
	}
}

function set(o, key, value, r) {
	modify(o, key);

	return Reflect.set(o, key, value, r);
}

function deleteProperty(o, key) {
	modify(o, key);

	return Reflect.deleteProperty(o, key);
}

export function effect(callback) {
	queue.push(callback);

	if (!scheduled) {
		scheduled = true;

		setTimeout(() => {
			scheduled = false;

			let callbacks = queue.splice(0, Infinity);
			let prev = current;

			for (let cb of callbacks) {
				current = cb;

				cb();
			}

			current = prev;
		}, 0);
	}
}

export function watch(object) {
	reads.set(object, new Map());

	return new Proxy(object, {set, get, deleteProperty});
}

export function mutate(element, callback, value = () => {}) {
	let immediate = typeof value !== "function";
	let cb = () => {
		let el = element.deref();

		if (el && registered.has(el)) {
			callback(el, immediate ? value : value());
		}
	};
	let el = element.deref();

	if (el) {
		registered.add(el);
	}

	if (immediate) {
		cb();
	} else {
		effect(cb);
	}
}
