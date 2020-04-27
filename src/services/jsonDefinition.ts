/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONSchemaRef, JSONSchema } from '../jsonSchema';
import { DefinitionLink, Position, TextDocument, ASTNode, PropertyASTNode, Range, Thenable } from '../jsonLanguageTypes';
import { JSONDocument } from '../parser/jsonParser';

export function findDefinition(document: TextDocument, position: Position, doc: JSONDocument): Thenable<DefinitionLink[]> {
	const offset = document.offsetAt(position);
	const node = doc.getNodeFromOffset(offset, true);
	if (!node || !isRef(node)) {
		return Promise.resolve([]);
	}

	const propertyNode: PropertyASTNode = node.parent as PropertyASTNode;
	const valueNode = propertyNode.valueNode as ASTNode;
	const path = valueNode.value as string;
	const targetNode = findTargetNode(doc, path);
	if (!targetNode) {
		return Promise.resolve([]);
	}
	const definition: DefinitionLink = {
		targetUri: document.uri,
		originSelectionRange: createRange(document, valueNode),
		targetRange: createRange(document, targetNode),
		targetSelectionRange: createRange(document, targetNode)
	};
	return Promise.resolve([definition]);
}

function createRange(document: TextDocument, node: ASTNode): Range {
	return Range.create(document.positionAt(node.offset), document.positionAt(node.offset + node.length));
}

function isRef(node: ASTNode): boolean {
	return node.type === 'string' &&
		node.parent &&
		node.parent.type === 'property' &&
		node.parent.valueNode === node &&
		node.parent.keyNode.value === "$ref" ||
		false;
}

function findTargetNode(doc: JSONDocument, path: string): ASTNode | null {
	const tokens = parseJSONPointer(path);
	if (!tokens) {
		return null;
	}
	return findNode(tokens, doc.root);
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
