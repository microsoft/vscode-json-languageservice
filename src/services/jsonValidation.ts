/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONSchemaService, ResolvedSchema, UnresolvedSchema } from './jsonSchemaService';
import { JSONDocument } from '../parser/jsonParser';

import { TextDocument, ErrorCode, PromiseConstructor, Thenable, LanguageSettings, DocumentLanguageSettings, SeverityLevel, Diagnostic, DiagnosticSeverity, Range  } from '../jsonLanguageTypes';
import * as nls from 'vscode-nls';
import { JSONSchemaRef, JSONSchema } from '../jsonSchema';
import { isDefined, isBoolean } from '../utils/objects';

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

	public doValidation(textDocument: TextDocument, jsonDocument: JSONDocument, documentSettings?: DocumentLanguageSettings, schema?: JSONSchema): Thenable<Diagnostic[]> {
		if (!this.validationEnabled) {
			return this.promise.resolve([]);
		}
		let diagnostics: Diagnostic[] = [];
		let added: { [signature: string]: boolean } = {};
		let addProblem = (problem: Diagnostic) => {
			// remove duplicated messages
			let signature = problem.range.start.line + ' ' + problem.range.start.character + ' ' + problem.message;
			if (!added[signature]) {
				added[signature] = true;
				diagnostics.push(problem);
			}
		};
		let getDiagnostics = (schema: ResolvedSchema) => {
			let trailingCommaSeverity = documentSettings ? toDiagnosticSeverity(documentSettings.trailingCommas) : DiagnosticSeverity.Error;
			let commentSeverity = documentSettings ? toDiagnosticSeverity(documentSettings.comments) : this.commentSeverity;

			if (schema) {
				if (schema.errors.length && jsonDocument.root) {
					let astRoot = jsonDocument.root;
					let property = astRoot.type === 'object' ? astRoot.properties[0] : null;
					if (property && property.keyNode.value === '$schema') {
						let node = property.valueNode || property;
						let range = Range.create(textDocument.positionAt(node.offset), textDocument.positionAt(node.offset + node.length));
						addProblem(Diagnostic.create(range, schema.errors[0], DiagnosticSeverity.Warning, ErrorCode.SchemaResolveError));
					} else {
						let range = Range.create(textDocument.positionAt(astRoot.offset), textDocument.positionAt(astRoot.offset + 1));
						addProblem(Diagnostic.create(range, schema.errors[0], DiagnosticSeverity.Warning, ErrorCode.SchemaResolveError));
					}
				} else {
					let semanticErrors = jsonDocument.validate(textDocument, schema.schema);
					if (semanticErrors) {
						semanticErrors.forEach(addProblem);
					}
				}

				if (schemaAllowsComments(schema.schema)) {
					commentSeverity = void 0;
				}

				if (schemaAllowsTrailingCommas(schema.schema)) {
					trailingCommaSeverity = void 0;
				}
			}

			for (const p of jsonDocument.syntaxErrors) {
				if (p.code === ErrorCode.TrailingComma) {
					if (typeof trailingCommaSeverity !== 'number') {
						continue;
					}
					p.severity = trailingCommaSeverity;
				}
				addProblem(p);
			}

			if (typeof commentSeverity === 'number') {
				let message = localize('InvalidCommentToken', 'Comments are not permitted in JSON.');
				jsonDocument.comments.forEach(c => {
					addProblem(Diagnostic.create(c, message, commentSeverity, ErrorCode.CommentNotPermitted));
				});
			}
			return diagnostics;
		};

		if (schema) {
			const id = schema.id || ('schemaservice://untitled/' + idCounter++);
			return this.jsonSchemaService.resolveSchemaContent(new UnresolvedSchema(schema), id, {}).then(resolvedSchema => {
				return getDiagnostics(resolvedSchema);
			});
		}
		return this.jsonSchemaService.getSchemaForResource(textDocument.uri, jsonDocument).then(schema => {
			return getDiagnostics(schema);
		});
	}
}

let idCounter = 0;

function schemaAllowsComments(schemaRef: JSONSchemaRef) : boolean | undefined {
	if (schemaRef && typeof schemaRef === 'object') {
		if (isBoolean(schemaRef.allowComments)) {
			return schemaRef.allowComments;
		}
		if (schemaRef.allOf) {
			for (const schema of schemaRef.allOf) {
				const allow = schemaAllowsComments(schema);
				if (isBoolean(allow)) {
					return allow;
				}
			}
		}
	}
	return undefined;
}

function schemaAllowsTrailingCommas(schemaRef: JSONSchemaRef) : boolean | undefined {
	if (schemaRef && typeof schemaRef === 'object') {
		if (isBoolean(schemaRef.allowTrailingCommas)) {
			return schemaRef.allowTrailingCommas;
		}
		if (isBoolean(schemaRef['allowsTrailingCommas'])) { // deprecated
			return schemaRef['allowsTrailingCommas'];
		}
		if (schemaRef.allOf) {
			for (const schema of schemaRef.allOf) {
				const allow = schemaAllowsTrailingCommas(schema);
				if (isBoolean(allow)) {
					return allow;
				}
			}
		}
	}
	return undefined;
}

function toDiagnosticSeverity(severityLevel: SeverityLevel): DiagnosticSeverity | undefined {
	switch (severityLevel) {
		case 'error': return DiagnosticSeverity.Error;
		case 'warning': return DiagnosticSeverity.Warning;
		case 'ignore': return void 0;
	}
	return void 0;
}	