/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {JSONSchemaService} from './jsonSchemaService';
import {JSONDocument, ObjectASTNode} from '../parser/jsonParser';
import {TextDocument, Diagnostic, DiagnosticSeverity} from 'vscode-languageserver-types';
import {PromiseConstructor, Thenable, LanguageSettings} from '../jsonLanguageService';

export class JSONValidation {

	private jsonSchemaService: JSONSchemaService;
	private promise: PromiseConstructor;

	private validationEnabled: boolean;
	private comments: boolean;

	public constructor(jsonSchemaService: JSONSchemaService, promiseConstructor: PromiseConstructor) {
		this.jsonSchemaService = jsonSchemaService;
		this.promise = promiseConstructor;
		this.validationEnabled = true;
	}

	public configure(raw: LanguageSettings) {
		if (raw) {
			this.validationEnabled = raw.validate;
		}
	}

	public doValidation(textDocument: TextDocument, jsonDocument: JSONDocument) : Thenable<Diagnostic[]> {
		if (!this.validationEnabled) {
			return this.promise.resolve([]);
		}
		return this.jsonSchemaService.getSchemaForResource(textDocument.uri, jsonDocument).then(schema => {
			if (schema) {
				if (schema.errors.length && jsonDocument.root) {
					let astRoot = jsonDocument.root;
					let property = astRoot.type === 'object' ? (<ObjectASTNode>astRoot).getFirstProperty('$schema') : null;
					if (property) {
						let node = property.value || property;
						jsonDocument.warnings.push({ location: { start: node.start, end: node.end }, message: schema.errors[0] });
					} else {
						jsonDocument.warnings.push({ location: { start: astRoot.start, end: astRoot.start + 1 }, message: schema.errors[0] });
					}
				} else {
					jsonDocument.validate(schema.schema);
				}
			}

			let diagnostics: Diagnostic[] = [];
			let added: { [signature: string]: boolean } = {};
			jsonDocument.errors.concat(jsonDocument.warnings).forEach((error, idx) => {
				// remove duplicated messages
				let signature = error.location.start + ' ' + error.location.end + ' ' + error.message;
				if (!added[signature]) {
					added[signature] = true;
					let range = {
						start: textDocument.positionAt(error.location.start),
						end: textDocument.positionAt(error.location.end)
					};
					diagnostics.push({
						severity: idx >= jsonDocument.errors.length ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
						range: range,
						message: error.message
					});
				}
			});
			return diagnostics;
		});
	}
}