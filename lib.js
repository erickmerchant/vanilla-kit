let htmlMap = new WeakMap();
let nodeMap = new WeakMap();
let eventMap = new WeakMap();
let tokensRegex = /(<!--|-->|<[\w-]+|<\/[\w-]+>|\/>|[\'\"=>])/;
let namespaces = {
	html: "http://www.w3.org/1999/xhtml",
	svg: "http://www.w3.org/2000/svg",
	math: "http://www.w3.org/1998/Math/MathML",
};

export function html(strs, ...args) {
	let node = htmlMap.get(strs);

	if (!node) {
		node = {nodes: []};

		let stack = [node];
		let mode = 0;
		let comment = false;
		let quote;
		let attr;

		for (let token of tokenize(...strs)) {
			let head = stack[0];
			let dynamic = false;

			if (typeof token === "number") {
				dynamic = true;
			} else if (!token.trim()) {
				continue;
			}

			if (comment) {
				if (token === "-->") {
					comment = false;
				}
			} else if (mode == 0) {
				if (token === "<!--") {
					comment = true;
				} else if (token.startsWith?.("</")) {
					let item;
					let name = token.slice(2, -1);

					do {
						item = stack.shift();
					} while (item.name !== name);
				} else if (token.startsWith?.("<")) {
					mode = 1;
					let prevDynamic = head.nodes[head.nodes.length - 1]?.dynamic;

					stack.unshift({
						name: token.slice(1),
						dynamic: prevDynamic ? true : dynamic,
						attributes: [],
						nodes: [],
						root: stack.length === 1,
					});

					head.nodes.push(stack[0]);
				} else {
					head.nodes.push({dynamic, value: token});
				}
			} else if (mode === 1) {
				if (token === ">") {
					mode = 0;
				} else if (token === "/>") {
					mode = 0;

					stack.shift();
				} else if (token === "=") {
					mode = 2;
				} else {
					for (let name of token.trim().split(/\s+/)) {
						if (name.startsWith("@")) {
							let parts = name.slice(1).split(".");
							let options = {};

							while (
								parts.length &&
								["capture", "once", "passive"].includes(parts[parts.length - 1])
							) {
								options[parts.pop()] = true;
							}

							name = parts.join(".");

							attr = {type: 3, name, value: null, options};
						} else if (name.startsWith(".")) {
							attr = {type: 2, name: name.slice(1), value: true};
						} else {
							attr = {type: 1, name, value: true};
						}

						head.attributes.push(attr);
					}
				}
			} else if (mode === 2) {
				if (token === "'" || token === '"') {
					attr.value = "";
					quote = token;

					mode = 3;
				} else if (dynamic) {
					attr.value = token;
					attr.dynamic = true;

					mode = 1;
				} else {
					throw Error();
				}
			} else if (token === quote) {
				mode = 1;

				quote = null;
			} else {
				if (dynamic) throw Error();

				attr.value += token;
			}

			if (dynamic) {
				for (let s of stack) {
					if (s.dynamic) break;

					s.dynamic = true;
				}
			}
		}

		htmlMap.set(strs, node);
	}

	return {node, args};
}

function* tokenize(...strs) {
	for (let i = 0; i < strs.length; i++) {
		yield* strs[i].split(tokensRegex);

		if (i < strs.length - 1) {
			yield i;
		}
	}
}

export function render(
	{node, args},
	element,
	isSimilar = nodeMap.get(element) === node,
	namespace = namespaces[node?.name] ?? namespaces.html
) {
	let document = element.ownerDocument;
	let currentChild = element.firstChild;

	if (node.root && !isSimilar) {
		nodeMap.set(element, node);
	}

	for (let {type, name, options, value, dynamic} of node.attributes ?? []) {
		if (isSimilar && !dynamic) continue;

		let current;

		if (dynamic) {
			current = args[value];
		} else {
			current = value;
		}

		if (type === 3) {
			if (!isSimilar) {
				element.addEventListener(name, handleEvent, options);
			}

			let events = eventMap.get(element) ?? new Map();

			events.set(name, current);

			eventMap.set(element, events);
		} else if (type === 2) {
			if (element[name] !== current) {
				element[name] = current;
			}
		} else if (current !== null) {
			if (current === true || current === false) {
				element.toggleAttribute(name, current);
			} else {
				element.setAttribute(name, current);
			}
		} else {
			element.removeAttribute(name);
		}
	}

	for (let subNode of walkNodes({node, args})) {
		let newChild;
		let isDynamic = subNode.node?.dynamic;

		if (!currentChild || isDynamic) {
			if (subNode.node.value != null) {
				let value = String(subNode.node.value);

				if (currentChild?.nodeType === 3) {
					if (currentChild.nodeValue !== value) {
						currentChild.nodeValue = value;
					}
				} else {
					newChild = document.createTextNode(value);
				}
			} else {
				let subIsSimilar = subNode.node.root
					? nodeMap.get(currentChild) === subNode.node
					: isSimilar;
				let subNamespace = namespaces[subNode.node?.name] ?? namespace;

				if (!subIsSimilar) {
					newChild = document.createElementNS(subNamespace, subNode.node.name);
				}

				render(subNode, newChild ?? currentChild, subIsSimilar, subNamespace);
			}
		}

		if (newChild) {
			if (currentChild) {
				currentChild.replaceWith(newChild);
			} else {
				element.append(newChild);
			}

			currentChild = newChild;
		}

		currentChild = currentChild?.nextSibling;
	}

	while (currentChild) {
		let nextChild = currentChild.nextSibling;

		currentChild.remove();

		currentChild = nextChild;
	}
}

function* walkNodes({node, args}) {
	for (let n of node.nodes) {
		if (n.dynamic && n.value != null) {
			let value = args[n.value];

			for (let result of [].concat(value)) {
				if (result == null) continue;
				else if (result.node) {
					yield* walkNodes(result);
				} else {
					yield {node: {dynamic: true, value: result}};
				}
			}
		} else {
			yield {node: n, args};
		}
	}
}

function handleEvent(event) {
	eventMap
		.get(event.currentTarget)
		?.get(event.type)
		?.call(event.currentTarget, event);
}
