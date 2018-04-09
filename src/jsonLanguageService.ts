/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic, DiagnosticSeverity,
	TextEdit, FormattingOptions, MarkedString
} from 'vscode-languageserver-types';

import { JSONCompletion } from './services/jsonCompletion';
import { JSONHover } from './services/jsonHover';
import { JSONValidation } from './services/jsonValidation';
import { JSONSchema } from './jsonSchema';
import { JSONDocumentSymbols } from './services/jsonDocumentSymbols';
import { parse as parseJSON, JSONDocumentConfig, JSONDocument as InternalJSONDocument, newJSONDocument } from './parser/jsonParser';
import { schemaContributions } from './services/configuration';
import { JSONSchemaService } from './services/jsonSchemaService';
import { JSONWorkerContribution, JSONPath, Segment, CompletionsCollector } from './jsonContributions';
import { format as formatJSON } from 'jsonc-parser';
import { format } from 'util';

export type JSONDocument = {};
export { JSONSchema, JSONWorkerContribution, JSONPath, Segment, CompletionsCollector };
export {
	TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic,
	TextEdit, FormattingOptions, MarkedString
};

export type ASTNodeParent = ObjectASTNode | ArrayASTNode | PropertyASTNode;
export type ASTNode = ObjectASTNode | PropertyASTNode | ArrayASTNode | StringASTNode | NumberASTNode | BooleanASTNode | NullASTNode;

export interface BaseASTNode {
	readonly type: 'object' | 'array' | 'property' | 'string' | 'number' | 'boolean' | 'null';
	readonly parent?: ASTNodeParent;
	readonly offset: number;
	readonly length: number;
	readonly children: ASTNode[];
}
export interface ObjectASTNode extends BaseASTNode {
	readonly type: 'object';
	readonly properties: PropertyASTNode[];
}
export interface PropertyASTNode extends BaseASTNode {
	readonly type: 'property';
	readonly keyNode: StringASTNode;
	readonly valueNode: ASTNode;
	readonly colonOffset: number;
}
export interface ArrayASTNode extends BaseASTNode {
	readonly type: 'array';
	readonly items: ASTNode[];
}
export interface StringASTNode extends BaseASTNode {
	readonly type: 'string';
	readonly value: string;
}
export interface NumberASTNode extends BaseASTNode {
	readonly type: 'number';
	readonly value: number;
	readonly isInteger: boolean;
}
export interface BooleanASTNode extends BaseASTNode {
	readonly type: 'boolean';
	readonly value: boolean;
}
export interface NullASTNode extends BaseASTNode {
	readonly type: 'null';
}

export interface LanguageService {
	configure(settings: LanguageSettings): void;
	doValidation(document: TextDocument, jsonDocument: JSONDocument, documentSettings?: DocumentLanguageSettings): Thenable<Diagnostic[]>;
	parseJSONDocument(document: TextDocument): JSONDocument;
	newJSONDocument(rootNode: ASTNode, syntaxDiagnostics?: Diagnostic[]): JSONDocument;
	resetSchema(uri: string): boolean;
	doResolve(item: CompletionItem): Thenable<CompletionItem>;
	doComplete(document: TextDocument, position: Position, doc: JSONDocument): Thenable<CompletionList | null>;
	findDocumentSymbols(document: TextDocument, doc: JSONDocument): SymbolInformation[];
	/** deprecated, use findDocumentColors instead */
	findColorSymbols(document: TextDocument, doc: JSONDocument): Thenable<Range[]>;
	findDocumentColors(document: TextDocument, doc: JSONDocument): Thenable<ColorInformation[]>;
	getColorPresentations(document: TextDocument, doc: JSONDocument, color: Color, range: Range): ColorPresentation[];
	doHover(document: TextDocument, position: Position, doc: JSONDocument): Thenable<Hover | null>;
	format(document: TextDocument, range: Range, options: FormattingOptions): TextEdit[];
}

export interface Color {
	red: number; blue: number; green: number; alpha: number;
}

export interface ColorInformation {
	range: Range;
	color: Color;
}

export interface ColorPresentation {
	/**
	 * The label of this color presentation. It will be shown on the color
	 * picker header. By default this is also the text that is inserted when selecting
	 * this color presentation.
	 */
	label: string;
	/**
	 * An [edit](#TextEdit) which is applied to a document when selecting
	 * this presentation for the color.  When `falsy` the [label](#ColorPresentation.label)
	 * is used.
	 */
	textEdit?: TextEdit;
	/**
	 * An optional array of additional [text edits](#TextEdit) that are applied when
	 * selecting this color presentation. Edits must not overlap with the main [edit](#ColorPresentation.textEdit) nor with themselves.
	 */
	additionalTextEdits?: TextEdit[];
}

export interface LanguageSettings {
	/**
	 * If set, the validator will return syntax and semantic errors.
	 */
	validate?: boolean;
	/**
	 * Defines whether comments are allowed or not. If set to false, comments will be reported as errors.
	 * DocumentLanguageSettings.allowComments will override this setting.
	 */
	allowComments?: boolean;

	/**
	 * A list of known schemas and/or associations of schemas to file names.
	 */
	schemas?: SchemaConfiguration[];
}

export type SeverityLevel = 'error' | 'warning' | 'ignore';

export interface DocumentLanguageSettings {
	/**
	 * The severity of reported comments. If not set, 'LanguageSettings.allowComments' defines wheter comments are ignored or reported as errors.
	 */
	comments?: SeverityLevel;

	/**
	 * The severity of reported trailing commas. If not set, trailing commas will be reported as errors.
	 */
	trailingCommas?: SeverityLevel;
}

export interface SchemaConfiguration {
	/**
	 * The URI of the schema, which is also the identifier of the schema.
	 */
	uri: string;
	/**
	 * A list of file names that are associated to the schema. The '*' wildcard can be used. For example '*.schema.json', 'package.json'
	 */
	fileMatch?: string[];
	/**
	 * The schema for the given URI.
	 * If no schema is provided, the schema will be fetched with the schema request service (if available).
	 */
	schema?: JSONSchema;
}

export interface WorkspaceContextService {
	resolveRelativePath(relativePath: string, resource: string): string;
}
/**
 * The schema request service is used to fetch schemas. The result should the schema file comment, or,
 * in case of an error, a displayable error string
 */
export interface SchemaRequestService {
	(uri: string): Thenable<string>;
}

export interface PromiseConstructor {
    /**
     * Creates a new Promise.
     * @param executor A callback used to initialize the promise. This callback is passed two arguments:
     * a resolve callback used resolve the promise with a value or the result of another promise,
     * and a reject callback used to reject the promise with a provided reason or error.
     */
	new <T>(executor: (resolve: (value?: T | Thenable<T>) => void, reject: (reason?: any) => void) => void): Thenable<T>;

    /**
     * Creates a Promise that is resolved with an array of results when all of the provided Promises
     * resolve, or rejected when any Promise is rejected.
     * @param values An array of Promises.
     * @returns A new Promise.
     */
	all<T>(values: Array<T | Thenable<T>>): Thenable<T[]>;
    /**
     * Creates a new rejected promise for the provided reason.
     * @param reason The reason the promise was rejected.
     * @returns A new rejected Promise.
     */
	reject<T>(reason: any): Thenable<T>;

    /**
      * Creates a new resolved promise for the provided value.
      * @param value A promise.
      * @returns A promise whose internal state matches the provided promise.
      */
	resolve<T>(value: T | Thenable<T>): Thenable<T>;

}

export interface Thenable<R> {
    /**
    * Attaches callbacks for the resolution and/or rejection of the Promise.
    * @param onfulfilled The callback to execute when the Promise is resolved.
    * @param onrejected The callback to execute when the Promise is rejected.
    * @returns A Promise for the completion of which ever callback is executed.
    */
	then<TResult>(onfulfilled?: (value: R) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Thenable<TResult>;
	then<TResult>(onfulfilled?: (value: R) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Thenable<TResult>;
}

export interface LanguageServiceParams {
	/**
	 * The schema request service is used to fetch schemas. The result should the schema file comment, or,
	 * in case of an error, a displayable error string
	 */
	schemaRequestService?: SchemaRequestService;
	/**
	 * The workspace context is used to resolve relative paths for relative schema references.
	 */
	workspaceContext?: WorkspaceContextService;
	/**
	 * An optional set of completion and hover participants.
	 */
	contributions?: JSONWorkerContribution[];
	/**
	 * A promise constructor. If not set, the ES5 Promise will be used.
	 */
	promiseConstructor?: PromiseConstructor;
}

export function getLanguageService(params: LanguageServiceParams): LanguageService {
	let promise = params.promiseConstructor || Promise;

	let jsonSchemaService = new JSONSchemaService(params.schemaRequestService, params.workspaceContext, promise);
	jsonSchemaService.setSchemaContributions(schemaContributions);

	let jsonCompletion = new JSONCompletion(jsonSchemaService, params.contributions, promise);
	let jsonHover = new JSONHover(jsonSchemaService, params.contributions, promise);
	let jsonDocumentSymbols = new JSONDocumentSymbols(jsonSchemaService);
	let jsonValidation = new JSONValidation(jsonSchemaService, promise);

	return {
		configure: (settings: LanguageSettings) => {
			jsonSchemaService.clearExternalSchemas();
			if (settings.schemas) {
				settings.schemas.forEach(settings => {
					jsonSchemaService.registerExternalSchema(settings.uri, settings.fileMatch, settings.schema);
				});
			}
			jsonValidation.configure(settings);
		},
		resetSchema: (uri: string) => jsonSchemaService.onResourceChange(uri),
		doValidation: jsonValidation.doValidation.bind(jsonValidation),
		parseJSONDocument: (document: TextDocument) => parseJSON(document, { collectComments: true }),
		newJSONDocument: (root: ASTNode, diagnostics: Diagnostic[]) => newJSONDocument(root, diagnostics),
		doResolve: jsonCompletion.doResolve.bind(jsonCompletion),
		doComplete: jsonCompletion.doComplete.bind(jsonCompletion),
		findDocumentSymbols: jsonDocumentSymbols.findDocumentSymbols.bind(jsonDocumentSymbols),
		findColorSymbols: (d, s) => jsonDocumentSymbols.findDocumentColors(d, <InternalJSONDocument>s).then(s => s.map(s => s.range)),
		findDocumentColors: jsonDocumentSymbols.findDocumentColors.bind(jsonDocumentSymbols),
		getColorPresentations: jsonDocumentSymbols.getColorPresentations.bind(jsonDocumentSymbols),
		doHover: jsonHover.doHover.bind(jsonHover),
		format: (d, r, o) => {
			let range = void 0;
			if (r) {
				let offset = d.offsetAt(r.start);
				let length = d.offsetAt(r.end) - offset;
				range = { offset, length };
			}
			let options = { tabSize: o ? o.tabSize : 4, insertSpaces: o ? o.insertSpaces : true, eol: '\n' };
			return formatJSON(d.getText(), range, options).map(e => {
				return TextEdit.replace(Range.create(d.positionAt(e.offset), d.positionAt(e.offset + e.length)), e.content);
			});
		}
	};
}
