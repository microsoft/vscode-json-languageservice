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

		// use the property description when hovering over an object key
		if (node && node.type === 'string') {
			let stringNode = <Parser.StringASTNode>node;
			if (stringNode.isKey) {
				let propertyNode = <Parser.PropertyASTNode>node.parent;
				node = propertyNode.value;

			}
		}

		if (!node) {
			return this.promise.resolve(void 0);
		}

		var createHover = (contents: MarkedString[]) => {
			let range = Range.create(document.positionAt(node.start), document.positionAt(node.end));
			let result: Hover = {
				contents: contents,
				range: range
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
				matchingSchemas.every((s) => {
					if (s.node === node && !s.inverted && s.schema) {
						description = description || s.schema.description;
					}
					return true;
				});
				if (description) {
					return createHover([description]);
				}
			}
			return void 0;
		});
	}
}