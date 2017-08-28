/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Parser = require('../parser/jsonParser');
import Strings = require('../utils/strings');
import { colorFromHex } from '../utils/colors';

import { SymbolInformation, SymbolKind, TextDocument, Range, Location } from 'vscode-languageserver-types';
import { Thenable, ColorInformation } from "../jsonLanguageService";
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
				(<Parser.ArrayASTNode>root).items.forEach((item) => {
					if (item.type === 'object') {
						let property = (<Parser.ObjectASTNode>item).getFirstProperty('key');
						if (property && property.value) {
							let location = Location.create(document.uri, Range.create(document.positionAt(item.start), document.positionAt(item.end)));
							result.push({ name: property.value.getValue(), kind: SymbolKind.Function, location: location });
						}
					}
				});
				return result;
			}
		}

		let collectOutlineEntries = (result: SymbolInformation[], node: Parser.ASTNode, containerName: string): SymbolInformation[] => {
			if (node.type === 'array') {
				(<Parser.ArrayASTNode>node).items.forEach((node: Parser.ASTNode) => {
					collectOutlineEntries(result, node, containerName);
				});
			} else if (node.type === 'object') {
				let objectNode = <Parser.ObjectASTNode>node;

				objectNode.properties.forEach((property: Parser.PropertyASTNode) => {
					let location = Location.create(document.uri, Range.create(document.positionAt(property.start), document.positionAt(property.end)));
					let valueNode = property.value;
					if (valueNode) {
						let childContainerName = containerName ? containerName + '.' + property.key.value : property.key.value;
						result.push({ name: property.key.getValue(), kind: this.getSymbolKind(valueNode.type), location: location, containerName: containerName });
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
				let matchingSchemas: Parser.IApplicableSchema[] = [];
				doc.validate(schema.schema, matchingSchemas);
				let visitedNode = {};
				let text = document.getText();
				for (let s of matchingSchemas) {
					if (!s.inverted && s.schema && s.schema.format === 'color' && s.node && s.node.type === 'string') {
						let nodeId = String(s.node.start);
						if (!visitedNode[nodeId]) {
							let color = colorFromHex(s.node.getValue());
							if (color) {
								let range = Range.create(document.positionAt(s.node.start), document.positionAt(s.node.end));
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
	

}