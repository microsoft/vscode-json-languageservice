/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range, Position, SelectionRange, TextDocument } from '../jsonLanguageTypes';

import { JSONDocument } from '../parser/jsonParser';
import { SyntaxKind, createScanner } from 'jsonc-parser';

export function getSelectionRanges(document: TextDocument, positions: Position[], doc: JSONDocument): SelectionRange[] {

	function getSelectionRange(position: Position): SelectionRange {
		let offset = document.offsetAt(position);
		let node = doc.getNodeFromOffset(offset, true);

		const result: Range[] = [];

		while (node) {
			switch (node.type) {
				case 'string':
				case 'object':
				case 'array':
					// range without ", [ or {
					const cStart = node.offset + 1, cEnd = node.offset + node.length - 1;
					if (cStart < cEnd && offset >= cStart && offset <= cEnd) {
						result.push(newRange(cStart, cEnd));
					}
					result.push(newRange(node.offset, node.offset + node.length));
					break;
				case 'number':
				case 'boolean':
				case 'null':
				case 'property':
					result.push(newRange(node.offset, node.offset + node.length));
					break;
			}
			if (node.type === 'property' || node.parent && node.parent.type === 'array') {
				const afterCommaOffset = getOffsetAfterNextToken(node.offset + node.length, SyntaxKind.CommaToken);
				if (afterCommaOffset !== -1) {
					result.push(newRange(node.offset, afterCommaOffset));
				}
			}
			node = node.parent;
		}
		let current: SelectionRange | undefined = undefined;
		for (let index = result.length - 1; index >= 0; index--) {
			current = SelectionRange.create(result[index], current);
		}
		if (!current) {
			current = SelectionRange.create(Range.create(position, position));
		}
		return current;
	}

	function newRange(start: number, end: number): Range {
		return Range.create(document.positionAt(start), document.positionAt(end));
	}

	const scanner = createScanner(document.getText(), true);

	function getOffsetAfterNextToken(offset: number, expectedToken: SyntaxKind): number {
		scanner.setPosition(offset);
		let token = scanner.scan();
		if (token === expectedToken) {
			return scanner.getTokenOffset() + scanner.getTokenLength();
		}
		return -1;
	}

	return positions.map(getSelectionRange);
}





