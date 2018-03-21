/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { JSONSchemaService } from './jsonSchemaService';
import { JSONDocument, ObjectASTNode, IProblem, ProblemSeverity, ErrorCode } from '../parser/jsonParser';
import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import { PromiseConstructor, Thenable, LanguageSettings, DocumentLanguageSettings } from '../jsonLanguageService';
import * as nls from 'vscode-nls';
import { JSONSchemaRef } from '../jsonSchema';

const localize = nls.loadMessageBundle();

export class JSONValidation {

	private jsonSchemaService: JSONSchemaService;
	private promise: PromiseConstructor;

	private validationEnabled: boolean;
	private commentSeverity: ProblemSeverity;

	public constructor(jsonSchemaService: JSONSchemaService, promiseConstructor: PromiseConstructor) {
		this.jsonSchemaService = jsonSchemaService;
		this.promise = promiseConstructor;
		this.validationEnabled = true;
	}

	public configure(raw: LanguageSettings) {
		if (raw) {
			this.validationEnabled = raw.validate;
			this.commentSeverity = raw.allowComments ? ProblemSeverity.Ignore : ProblemSeverity.Error;
		}
	}

	public doValidation(textDocument: TextDocument, jsonDocument: JSONDocument, documentSettings?: DocumentLanguageSettings): Thenable<Diagnostic[]> {
		if (!this.validationEnabled) {
			return this.promise.resolve([]);
		}
		let diagnostics: Diagnostic[] = [];
		let added: { [signature: string]: boolean } = {};
		let addProblem = (problem: IProblem) => {
			if (problem.severity === ProblemSeverity.Ignore) {
				return;
			}

			// remove duplicated messages
			let signature = problem.location.start + ' ' + problem.location.end + ' ' + problem.message;
			if (!added[signature]) {
				added[signature] = true;
				let range = {
					start: textDocument.positionAt(problem.location.start),
					end: textDocument.positionAt(problem.location.end)
				};
				let severity: DiagnosticSeverity = problem.severity === ProblemSeverity.Error ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
				diagnostics.push({ severity, range, message: problem.message });
			}
		};

		return this.jsonSchemaService.getSchemaForResource(textDocument.uri, jsonDocument).then(schema => {
			let trailingCommaSeverity = documentSettings ? <ProblemSeverity>documentSettings.trailingCommas : ProblemSeverity.Error;
			let commentSeverity = documentSettings ? <ProblemSeverity>documentSettings.comments : this.commentSeverity;

			if (schema) {
				if (schema.errors.length && jsonDocument.root) {
					let astRoot = jsonDocument.root;
					let property = astRoot.type === 'object' ? (<ObjectASTNode>astRoot).getFirstProperty('$schema') : null;
					if (property) {
						let node = property.value || property;
						addProblem({ location: { start: node.start, end: node.end }, message: schema.errors[0], severity: ProblemSeverity.Warning });
					} else {
						addProblem({ location: { start: astRoot.start, end: astRoot.start + 1 }, message: schema.errors[0], severity: ProblemSeverity.Warning });
					}
				} else {
					let semanticErrors = jsonDocument.validate(schema.schema);
					if (semanticErrors) {
						semanticErrors.forEach(addProblem);
					}
				}
				if (schemaAllowsComments(schema.schema)) {
					trailingCommaSeverity = commentSeverity = ProblemSeverity.Ignore;
				}
			}
			if (jsonDocument.syntaxErrors != undefined) {
				jsonDocument.syntaxErrors.forEach(p => {
					if (p.code === ErrorCode.TrailingComma) {
						p.severity = trailingCommaSeverity;
					}
					addProblem(p);
				});
			}

			if (commentSeverity !== ProblemSeverity.Ignore) {
				let message = localize('InvalidCommentToken', 'Comments are not permitted in JSON.');
				jsonDocument.comments.forEach(c => {
					addProblem({ location: c, severity: commentSeverity, message });
				});
			}
			return diagnostics;
		});
	}
}

function schemaAllowsComments(schemaRef: JSONSchemaRef) {
	if (schemaRef && typeof schemaRef === 'object') {
		if (schemaRef.allowComments) {
			return true;
		}
		if (schemaRef.allOf) {
			return schemaRef.allOf.some(schemaAllowsComments);
		}
	}
	return false;
}
