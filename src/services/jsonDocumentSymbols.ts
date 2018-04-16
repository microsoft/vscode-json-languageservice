/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Parser from '../parser/jsonParser';
import * as Strings from '../utils/strings';
import { colorFromHex } from '../utils/colors';

import { SymbolInformation, SymbolKind, TextDocument, Range, Location, TextEdit } from 'vscode-languageserver-types';
import { Thenable, ColorInformation, ColorPresentation, Color, ArrayASTNode, ObjectASTNode, ASTNode, PropertyASTNode } from "../jsonLanguageTypes";

import { IJSONSchemaService } from "./jsonSchemaService";

export class JSONDocumentSymbols {

	constructor(private schemaService: IJSONSchemaService) {
	}

	public findDocumentSymbols(document: TextDocument, doc: Parser.JSONDocument): SymbolInformation[] {

		let root = doc.root;
		if (!root) {
			return null;
		}

		// special handling for key bindings
		let resourceString = document.uri;
		if ((resourceString === 'vscode://defaultsettings/keybindings.json') || Strings.endsWith(resourceString.toLowerCase(), '/user/keybindings.json')) {
			if (root.type === 'array') {
				let result: SymbolInformation[] = [];
				root.items.forEach(item => {
					if (item.type === 'object') {
						for (let property of item.properties) {
							if (property.keyNode.value === 'key') {
								if (property.valueNode) {
									let location = Location.create(document.uri, Range.create(document.positionAt(item.offset), document.positionAt(item.offset + item.length)));
									result.push({ name: Parser.getNodeValue(property.valueNode), kind: SymbolKind.Function, location: location });
								}
								return;
							}
						}
					}
				});
				return result;
			}
		}

		let collectOutlineEntries = (result: SymbolInformation[], node: ASTNode, containerName: string): SymbolInformation[] => {
			if (node.type === 'array') {
				node.items.forEach(node => collectOutlineEntries(result, node, containerName));
			} else if (node.type === 'object') {
				node.properties.forEach((property: PropertyASTNode) => {
					let location = Location.create(document.uri, Range.create(document.positionAt(property.offset), document.positionAt(property.offset + property.length)));
					let valueNode = property.valueNode;
					if (valueNode) {
						let childContainerName = containerName ? containerName + '.' + property.keyNode.value : property.keyNode.value;
						result.push({ name: property.keyNode.value, kind: this.getSymbolKind(valueNode.type), location: location, containerName: containerName });
						collectOutlineEntries(result, valueNode, childContainerName);
					}
				});
			}
			return result;
		};
		let result = collectOutlineEntries([], root, void 0);
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

	public findDocumentColors(document: TextDocument, doc: Parser.JSONDocument): Thenable<ColorInformation[]> {
		return this.schemaService.getSchemaForResource(document.uri, doc).then(schema => {
			let result: ColorInformation[] = [];
			if (schema) {
				let matchingSchemas = doc.getMatchingSchemas(schema.schema);
				let visitedNode = {};
				for (let s of matchingSchemas) {
					if (!s.inverted && s.schema && (s.schema.format === 'color' || s.schema.format === 'color-hex') && s.node && s.node.type === 'string') {
						let nodeId = String(s.node.offset);
						if (!visitedNode[nodeId]) {
							let color = colorFromHex(Parser.getNodeValue(s.node));
							if (color) {
								let range = Range.create(document.positionAt(s.node.offset), document.positionAt(s.node.offset + s.node.length));
								result.push({ color, range });
							}
							visitedNode[nodeId] = true;
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