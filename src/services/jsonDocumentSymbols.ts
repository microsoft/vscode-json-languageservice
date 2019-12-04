/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Parser from '../parser/jsonParser';
import * as Strings from '../utils/strings';
import { colorFromHex } from '../utils/colors';

import {
	TextDocument, Thenable, ColorInformation, ColorPresentation, Color, ASTNode, PropertyASTNode, DocumentSymbolsContext, Range, TextEdit,
	SymbolInformation, SymbolKind, DocumentSymbol, Location
} from "../jsonLanguageTypes";

import { IJSONSchemaService } from "./jsonSchemaService";

export class JSONDocumentSymbols {

	constructor(private schemaService: IJSONSchemaService) {
	}

	public findDocumentSymbols(document: TextDocument, doc: Parser.JSONDocument, context: DocumentSymbolsContext = { resultLimit: Number.MAX_VALUE }): SymbolInformation[] {

		let root = doc.root;
		if (!root) {
			return null;
		}

		let limit = context.resultLimit;

		// special handling for key bindings
		let resourceString = document.uri;
		if ((resourceString === 'vscode://defaultsettings/keybindings.json') || Strings.endsWith(resourceString.toLowerCase(), '/user/keybindings.json')) {
			if (root.type === 'array') {
				let result: SymbolInformation[] = [];
				for (let item of root.items) {
					if (item.type === 'object') {
						for (let property of item.properties) {
							if (property.keyNode.value === 'key' && property.valueNode) {
								let location = Location.create(document.uri, getRange(document, item));
								result.push({ name: Parser.getNodeValue(property.valueNode), kind: SymbolKind.Function, location: location });
								limit--;
								if (limit <= 0) {
									if (context && context.onResultLimitExceeded) {
										context.onResultLimitExceeded(resourceString);
									}
									return result;
								}
							}
						}
					}
				}
				return result;
			}
		}

		const toVisit: { node: ASTNode, containerName: string }[] = [
			{ node: root, containerName: '' }
		];
		let nextToVisit = 0;
		let limitExceeded = false;

		const result: SymbolInformation[] = [];

		let collectOutlineEntries = (node: ASTNode, containerName: string): void => {
			if (node.type === 'array') {
				node.items.forEach(node => {
					if (node) {
						toVisit.push({ node, containerName });
					}
				});
			} else if (node.type === 'object') {
				node.properties.forEach((property: PropertyASTNode) => {
					let valueNode = property.valueNode;
					if (valueNode) {
						if (limit > 0) {
							limit--;
							const location = Location.create(document.uri, getRange(document, property));
							const childContainerName = containerName ? containerName + '.' + property.keyNode.value : property.keyNode.value;
							result.push({ name: this.getKeyLabel(property), kind: this.getSymbolKind(valueNode.type), location: location, containerName: containerName });
							toVisit.push({ node: valueNode, containerName: childContainerName });
						} else {
							limitExceeded = true;
						}
					}
				});
			}
		};

		// breath first traversal
		while (nextToVisit < toVisit.length) {
			const next = toVisit[nextToVisit++];
			collectOutlineEntries(next.node, next.containerName);
		}

		if (limitExceeded && context && context.onResultLimitExceeded) {
			context.onResultLimitExceeded(resourceString);
		}
		return result;
	}

	public findDocumentSymbols2(document: TextDocument, doc: Parser.JSONDocument, context: DocumentSymbolsContext = { resultLimit: Number.MAX_VALUE }): DocumentSymbol[] {

		let root = doc.root;
		if (!root) {
			return null;
		}

		let limit = context.resultLimit;

		// special handling for key bindings
		let resourceString = document.uri;
		if ((resourceString === 'vscode://defaultsettings/keybindings.json') || Strings.endsWith(resourceString.toLowerCase(), '/user/keybindings.json')) {
			if (root.type === 'array') {
				let result: DocumentSymbol[] = [];
				for (let item of root.items) {
					if (item.type === 'object') {
						for (let property of item.properties) {
							if (property.keyNode.value === 'key' && property.valueNode) {
								let range = getRange(document, item);
								let selectionRange = getRange(document, property.keyNode);
								result.push({ name: Parser.getNodeValue(property.valueNode), kind: SymbolKind.Function, range, selectionRange });
								limit--;
								if (limit <= 0) {
									if (context && context.onResultLimitExceeded) {
										context.onResultLimitExceeded(resourceString);
									}
									return result;
								}
							}
						}
					}
				}
				return result;
			}
		}

		const result: DocumentSymbol[] = [];
		const toVisit: { node: ASTNode, result: DocumentSymbol[] }[] = [
			{ node: root, result }
		];
		let nextToVisit = 0;
		let limitExceeded = false;

		let collectOutlineEntries = (node: ASTNode, result: DocumentSymbol[]) => {
			if (node.type === 'array') {
				node.items.forEach((node, index) => {
					if (node) {
						if (limit > 0) {
							limit--;
							let range = getRange(document, node);
							let selectionRange = range;
							let name = String(index);
							const symbol = { name, kind: this.getSymbolKind(node.type), range, selectionRange, children: [] };
							result.push(symbol);
							toVisit.push({ result: symbol.children, node });
						} else {
							limitExceeded = true;
						}
					}
				});
			} else if (node.type === 'object') {
				node.properties.forEach((property: PropertyASTNode) => {
					let valueNode = property.valueNode;
					if (valueNode) {
						if (limit > 0) {
							limit--;
							let range = getRange(document, property);
							let selectionRange = getRange(document, property.keyNode);
							const symbol = { name: this.getKeyLabel(property), kind: this.getSymbolKind(valueNode.type), range, selectionRange, children: [] };
							result.push(symbol);
							toVisit.push({ result: symbol.children, node: valueNode });
						} else {
							limitExceeded = true;
						}
					}
				});
			}
		};

		// breath first traversal
		while (nextToVisit < toVisit.length) {
			const next = toVisit[nextToVisit++];
			collectOutlineEntries(next.node, next.result);
		}

		if (limitExceeded && context && context.onResultLimitExceeded) {
			context.onResultLimitExceeded(resourceString);
		}
		return result;
	}


	private getSymbolKind(nodeType: string): SymbolKind {
		switch (nodeType) {
			case 'object':
				return SymbolKind.Module;
			case 'string':
				return SymbolKind.String;
			case 'number':
				return SymbolKind.Number;
			case 'array':
				return SymbolKind.Array;
			case 'boolean':
				return SymbolKind.Boolean;
			default: // 'null'
				return SymbolKind.Variable;
		}
	}

	private getKeyLabel(property: PropertyASTNode) {
		let name = property.keyNode.value;
		if (name) {
			name = name.replace(/[\n]/g, '↵');
		}
		if (name && name.trim()) {
			return name;
		}
		return `"${name}"`;
	}

	public findDocumentColors(document: TextDocument, doc: Parser.JSONDocument, context?: DocumentSymbolsContext): Thenable<ColorInformation[]> {
		return this.schemaService.getSchemaForResource(document.uri, doc).then(schema => {
			let result: ColorInformation[] = [];
			if (schema) {
				let limit = context && typeof context.resultLimit === 'number' ? context.resultLimit : Number.MAX_VALUE;
				let matchingSchemas = doc.getMatchingSchemas(schema.schema);
				let visitedNode = {};
				for (let s of matchingSchemas) {
					if (!s.inverted && s.schema && (s.schema.format === 'color' || s.schema.format === 'color-hex') && s.node && s.node.type === 'string') {
						let nodeId = String(s.node.offset);
						if (!visitedNode[nodeId]) {
							let color = colorFromHex(Parser.getNodeValue(s.node));
							if (color) {
								let range = getRange(document, s.node);
								result.push({ color, range });
							}
							visitedNode[nodeId] = true;
							limit--;
							if (limit <= 0) {
								if (context && context.onResultLimitExceeded) {
									context.onResultLimitExceeded(document.uri);
								}
								return result;
							}
						}
					}
				}
			}
			return result;
		});
	}

	public getColorPresentations(document: TextDocument, doc: Parser.JSONDocument, color: Color, range: Range): ColorPresentation[] {
		let result: ColorPresentation[] = [];
		let red256 = Math.round(color.red * 255), green256 = Math.round(color.green * 255), blue256 = Math.round(color.blue * 255);

		function toTwoDigitHex(n: number): string {
			const r = n.toString(16);
			return r.length !== 2 ? '0' + r : r;
		}

		let label;
		if (color.alpha === 1) {
			label = `#${toTwoDigitHex(red256)}${toTwoDigitHex(green256)}${toTwoDigitHex(blue256)}`;
		} else {
			label = `#${toTwoDigitHex(red256)}${toTwoDigitHex(green256)}${toTwoDigitHex(blue256)}${toTwoDigitHex(Math.round(color.alpha * 255))}`;
		}
		result.push({ label: label, textEdit: TextEdit.replace(range, JSON.stringify(label)) });

		return result;
	}

}

function getRange(document: TextDocument, node: ASTNode) {
	return Range.create(document.positionAt(node.offset), document.positionAt(node.offset + node.length));
}