/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { JSONSchemaService } from './jsonSchemaService';
import { JSONDocument, ObjectASTNode, IProblem, ProblemSeverity, ErrorCode } from '../parser/jsonParser';
import { TextDocument, Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import { PromiseConstructor, Thenable, LanguageSettings, DocumentLanguageSettings, SeverityLevel } from '../jsonLanguageService';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class JSONValidation {

	private jsonSchemaService: JSONSchemaService;
	private promise: PromiseConstructor;

	private validationEnabled: boolean;
	private commentSeverity: DiagnosticSeverity | undefined;

	public constructor(jsonSchemaService: JSONSchemaService, promiseConstructor: PromiseConstructor) {
		this.jsonSchemaService = jsonSchemaService;
		this.promise = promiseConstructor;
		this.validationEnabled = true;
	}

	public configure(raw: LanguageSettings) {
		if (raw) {
			this.validationEnabled = raw.validate;
			this.commentSeverity = raw.allowComments ? void 0 : DiagnosticSeverity.Error;
		}
	}

	private getSeverity(setting: SeverityLevel | undefined, def: DiagnosticSeverity | undefined): DiagnosticSeverity | undefined {
		switch (setting) {
			case 'error': return DiagnosticSeverity.Error;
			case 'warning': return DiagnosticSeverity.Error;
			case 'ignore': return void 0;
			default: return def;
		}
	}

	public doValidation(textDocument: TextDocument, jsonDocument: JSONDocument, documentSettings?: DocumentLanguageSettings): Thenable<Diagnostic[]> {
		if (!this.validationEnabled) {
			return this.promise.resolve([]);
		}
		let diagnostics: Diagnostic[] = [];
		let added: { [signature: string]: boolean } = {};
		let trailingCommaSeverity = this.getSeverity(documentSettings ? documentSettings.trailingCommas : void 0, DiagnosticSeverity.Error);
		let addProblem = (problem: IProblem) => {
			// remove duplicated messages
			let signature = problem.location.start + ' ' + problem.location.end + ' ' + problem.message;
			if (!added[signature]) {
				added[signature] = true;
				let range = {
					start: textDocument.positionAt(problem.location.start),
					end: textDocument.positionAt(problem.location.end)
				};
				let severity: DiagnosticSeverity = problem.severity === ProblemSeverity.Error ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
				if (problem.code === ErrorCode.TrailingComma) {
					severity = trailingCommaSeverity;
				}
				if (severity) {
					diagnostics.push({ severity, range, message: problem.message });
				}
			}
		};
		jsonDocument.syntaxErrors.forEach(addProblem);

		let commentSeverity = this.getSeverity(documentSettings ? documentSettings.trailingCommas : void 0, this.commentSeverity);
		if (commentSeverity) {
			let message = localize('InvalidCommentToken', 'Comments are not permitted in JSON.');
			jsonDocument.comments.forEach(c => {
				let range = {
					start: textDocument.positionAt(c.start),
					end: textDocument.positionAt(c.end)
				};
				diagnostics.push({ severity: DiagnosticSeverity.Error, range, message });
			});
		}

		return this.jsonSchemaService.getSchemaForResource(textDocument.uri, jsonDocument).then(schema => {
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
			}
			return diagnostics;
		});
	}
}