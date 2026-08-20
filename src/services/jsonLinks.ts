/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentLink } from 'vscode-languageserver-types';
import { TextDocument, ASTNode, PropertyASTNode, Range } from '../jsonLanguageTypes.js';
import { JSONDocument } from '../parser/jsonParser.js';

export function findLinks(document: TextDocument, doc: JSONDocument): PromiseLike<DocumentLink[]> {
	const links: DocumentLink[] = [];
	doc.visit(node => {
		if (node.type === "property" && node.keyNode.value === "$ref" && node.valueNode?.type === 'string') {
			const path = node.valueNode.value;
			const targetNode = findTargetNode(doc, path);
			if (targetNode) {
				const targetPos = document.positionAt(targetNode.offset);
				links.push({
					target: `${document.uri}#${targetPos.line + 1},${targetPos.character + 1}`,
					range: createRange(document, node.valueNode)
				});
			}
		}
		return true;
	});
	return Promise.resolve(links);
}

function createRange(document: TextDocument, node: ASTNode): Range {
	return Range.create(document.positionAt(node.offset + 1), document.positionAt(node.offset + node.length - 1));
}

function findTargetNode(doc: JSONDocument, path: string): ASTNode | null {
	const tokens = parseJSONPointer(path);
	if (tokens) {
		return findNode(tokens, doc.root);
	}

	if (path.charAt(0) === '#') {
		// Plain-name fragment: anchor reference (e.g. #foo)
		const anchor = path.substring(1);
		if (anchor.length > 0) {
			return findAnchorNode(doc, anchor);
		}
		return null;
	}

	// Check for references to embedded schemas by $id (e.g. "https://example.com/embedded")
	const hashIndex = path.indexOf('#');
	const uri = hashIndex >= 0 ? path.substring(0, hashIndex) : path;
	const fragment = hashIndex >= 0 ? path.substring(hashIndex + 1) : undefined;

	if (uri.length > 0) {
		const embeddedNode = findEmbeddedSchemaNode(doc, uri);
		if (embeddedNode) {
			if (!fragment || fragment.length === 0) {
				return embeddedNode;
			}
			if (fragment.charAt(0) === '/') {
				// JSON Pointer within the embedded schema
				const pointerTokens = fragment.substring(1).split(/\//).map(unescape);
				return findNode(pointerTokens, embeddedNode);
			}
			// Anchor within the embedded schema
			return findAnchorInSubtree(embeddedNode, fragment);
		}
	}

	return null;
}

function findNode(pointer: string[], node: ASTNode | null | undefined): ASTNode | null {
	if (!node) {
		return null;
	}
	if (pointer.length === 0) {
		return node;
	}

	const token: string = pointer.shift() as string;
	if (node && node.type === 'object') {
		const propertyNode: PropertyASTNode | undefined = node.properties.find((propertyNode) => propertyNode.keyNode.value === token);
		if (!propertyNode) {
			return null;
		}
		return findNode(pointer, propertyNode.valueNode);
	} else if (node && node.type === 'array') {
		if (token.match(/^(0|[1-9][0-9]*)$/)) {
			const index = Number.parseInt(token);
			const arrayItem = node.items[index];
			if (!arrayItem) {
				return null;
			}
			return findNode(pointer, arrayItem);
		}
	}
	return null;
}

function findAnchorNode(doc: JSONDocument, anchor: string): ASTNode | null {
	return findAnchorInSubtree(doc.root, anchor);
}

function findAnchorInSubtree(root: ASTNode | null | undefined, anchor: string): ASTNode | null {
	if (!root) {
		return null;
	}
	let result: ASTNode | null = null;
	const visit = (node: ASTNode): boolean => {
		if (node.type === 'object') {
			for (const prop of node.properties) {
				// $anchor: "foo" (2019-09+)
				if (prop.keyNode.value === '$anchor' && prop.valueNode?.type === 'string' && prop.valueNode.value === anchor) {
					result = node;
					return false;
				}
				// $id: "#foo" (draft-06/07 legacy anchors)
				if (prop.keyNode.value === '$id' && prop.valueNode?.type === 'string' && prop.valueNode.value === '#' + anchor) {
					result = node;
					return false;
				}
			}
		}
		const children = node.children;
		if (children) {
			for (const child of children) {
				if (!visit(child)) {
					return false;
				}
			}
		}
		return true;
	};
	visit(root);
	return result;
}

function findEmbeddedSchemaNode(doc: JSONDocument, uri: string): ASTNode | null {
	if (!doc.root) {
		return null;
	}
	let result: ASTNode | null = null;
	const visit = (node: ASTNode, isRoot: boolean): boolean => {
		if (node.type === 'object' && !isRoot) {
			for (const prop of node.properties) {
				if ((prop.keyNode.value === '$id' || prop.keyNode.value === 'id') &&
					prop.valueNode?.type === 'string' && prop.valueNode.value === uri) {
					result = node;
					return false;
				}
			}
		}
		const children = node.children;
		if (children) {
			for (const child of children) {
				if (!visit(child, false)) {
					return false;
				}
			}
		}
		return true;
	};
	visit(doc.root, true);
	return result;
}

function parseJSONPointer(path: string): string[] | null {
	if (path === "#") {
		return [];
	}

	if (path[0] !== '#' || path[1] !== '/') {
		return null;
	}

	return path.substring(2).split(/\//).map(unescape);
}

function unescape(str: string): string {
	return str.replace(/~1/g, '/').replace(/~0/g, '~');
}
