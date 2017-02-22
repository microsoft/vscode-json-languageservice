/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import Parser = require('../parser/jsonParser');
import SchemaService = require('./jsonSchemaService');
import {JSONWorkerContribution} from '../jsonContributions';
import {PromiseConstructor, Thenable} from '../jsonLanguageService';

import {Hover, TextDocument, Position, Range, MarkedString} from 'vscode-languageserver-types';

export class JSONHover {

	private schemaService: SchemaService.IJSONSchemaService;
	private contributions: JSONWorkerContribution[];
	private promise: PromiseConstructor;

	constructor(schemaService: SchemaService.IJSONSchemaService, contributions: JSONWorkerContribution[] = [], promiseConstructor: PromiseConstructor) {
		this.schemaService = schemaService;
		this.contributions = contributions;
		this.promise = promiseConstructor || Promise;
	}

	public doHover(document: TextDocument, position: Position, doc: Parser.JSONDocument): Thenable<Hover> {

		let offset = document.offsetAt(position);
		let node = doc.getNodeFromOffset(offset);
		if (!node || (node.type === 'object' || node.type === 'array') && offset > node.start + 1 && offset < node.end - 1) {
			return this.promise.resolve(void 0);
		}
		let hoverRangeNode = node;

		// use the property description when hovering over an object key
		if (node.type === 'string') {
			let stringNode = <Parser.StringASTNode>node;
			if (stringNode.isKey) {
				let propertyNode = <Parser.PropertyASTNode>node.parent;
				node = propertyNode.value;
				if (!node) {
					return this.promise.resolve(void 0);
				}	
			}
		}

		let hoverRange = Range.create(document.positionAt(hoverRangeNode.start), document.positionAt(hoverRangeNode.end));

		var createHover = (contents: MarkedString[]) => {
			let result: Hover = {
				contents: contents,
				range: hoverRange
			};
			return result;
		};

		let location = node.getPath();
		for (let i = this.contributions.length - 1; i >= 0; i--) {
			let contribution = this.contributions[i];
			let promise = contribution.getInfoContribution(document.uri, location);
			if (promise) {
				return promise.then(htmlContent => createHover(htmlContent));
			}
		}

		return this.schemaService.getSchemaForResource(document.uri, doc).then((schema) => {
			if (schema) {
				let matchingSchemas: Parser.IApplicableSchema[] = [];
				doc.validate(schema.schema, matchingSchemas, node.start);

				let description: string = null;
				let enumValueDescription = null, enumValue = null;;
				matchingSchemas.every((s) => {
					if (s.node === node && !s.inverted && s.schema) {
						description = description || s.schema.description;
						if (s.schema.enum && s.schema.enumDescriptions) {
							let idx = s.schema.enum.indexOf(node.getValue());
							enumValueDescription =  s.schema.enumDescriptions[idx];
							enumValue = s.schema.enum[idx];
						}
					}
					return true;
				});
				if (description) {
					if (enumValueDescription) {
						description = `${description}\n\n${enumValue}: ${enumValueDescription}`;
					}
					return createHover([MarkedString.fromPlainText(description)]);
				}
			}
			return void 0;
		});
	}
}