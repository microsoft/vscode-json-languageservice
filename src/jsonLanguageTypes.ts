/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONWorkerContribution, JSONPath, Segment, CompletionsCollector } from './jsonContributions';
import { JSONSchema } from './jsonSchema';
import {
	Range, Position, DocumentUri, MarkupContent, MarkupKind,
	Color, ColorInformation, ColorPresentation,
	FoldingRange, FoldingRangeKind, SelectionRange,
	Diagnostic, DiagnosticSeverity,
	CompletionItem, CompletionItemKind, CompletionList, CompletionItemTag,
	InsertTextFormat,
	SymbolInformation, SymbolKind, DocumentSymbol, Location, Hover, MarkedString, FormattingOptions as LSPFormattingOptions, DefinitionLink,
	CodeActionContext, Command, CodeAction,
	DocumentHighlight, DocumentLink, WorkspaceEdit,
	TextEdit, CodeActionKind,
	TextDocumentEdit, VersionedTextDocumentIdentifier, DocumentHighlightKind
} from 'vscode-languageserver-types';

import { TextDocument, TextDocumentContentChangeEvent } from 'vscode-languageserver-textdocument';

export {
	TextDocument,
	TextDocumentContentChangeEvent,
	Range, Position, DocumentUri, MarkupContent, MarkupKind,
	JSONSchema, JSONWorkerContribution, JSONPath, Segment, CompletionsCollector,
	Color, ColorInformation, ColorPresentation,
	FoldingRange, FoldingRangeKind, SelectionRange,
	Diagnostic, DiagnosticSeverity,
	CompletionItem, CompletionItemKind, CompletionList, CompletionItemTag,
	InsertTextFormat, DefinitionLink,
	SymbolInformation, SymbolKind, DocumentSymbol, Location, Hover, MarkedString,
	CodeActionContext, Command, CodeAction,
	DocumentHighlight, DocumentLink, WorkspaceEdit,
	TextEdit, CodeActionKind,
	TextDocumentEdit, VersionedTextDocumentIdentifier, DocumentHighlightKind
};

/**
 * Error codes used by diagnostics
 */
export enum ErrorCode {
	Undefined = 0,
	EnumValueMismatch = 1,
	Deprecated = 2,
	UnexpectedEndOfComment = 0x101,
	UnexpectedEndOfString = 0x102,
	UnexpectedEndOfNumber = 0x103,
	InvalidUnicode = 0x104,
	InvalidEscapeCharacter = 0x105,
	InvalidCharacter = 0x106,
	PropertyExpected = 0x201,
	CommaExpected = 0x202,
	ColonExpected = 0x203,
	ValueExpected = 0x204,
	CommaOrCloseBacketExpected = 0x205,
	CommaOrCloseBraceExpected = 0x206,
	TrailingComma = 0x207,
	DuplicateKey = 0x208,
	CommentNotPermitted = 0x209,
	PropertyKeysMustBeDoublequoted = 0x210,
	SchemaResolveError = 0x300,
	SchemaUnsupportedFeature = 0x301
}

export type ASTNode = ObjectASTNode | PropertyASTNode | ArrayASTNode | StringASTNode | NumberASTNode | BooleanASTNode | NullASTNode;

export interface BaseASTNode {
	readonly type: 'object' | 'array' | 'property' | 'string' | 'number' | 'boolean' | 'null';
	readonly parent?: ASTNode;
	readonly offset: number;
	readonly length: number;
	readonly children?: ASTNode[];
	readonly value?: string | boolean | number | null;
}
export interface ObjectASTNode extends BaseASTNode {
	readonly type: 'object';
	readonly properties: PropertyASTNode[];
	readonly children: ASTNode[];
}
export interface PropertyASTNode extends BaseASTNode {
	readonly type: 'property';
	readonly keyNode: StringASTNode;
	readonly valueNode?: ASTNode;
	readonly colonOffset?: number;
	readonly children: ASTNode[];
}
export interface ArrayASTNode extends BaseASTNode {
	readonly type: 'array';
	readonly items: ASTNode[];
	readonly children: ASTNode[];
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
	readonly value: null;
}

export interface MatchingSchema {
	node: ASTNode;
	schema: JSONSchema;
}

export interface JSONLanguageStatus {
	schemas: string[];
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

export enum SchemaDraft {
	v3 = 3,
	v4 = 4,
	v6 = 6,
	v7 = 7,
	v2019_09 = 19,
	v2020_12 = 20
}

export interface DocumentLanguageSettings {
	/**
	 * The severity of reported comments. If not set, 'LanguageSettings.allowComments' defines whether comments are ignored or reported as errors.
	 */
	comments?: SeverityLevel;

	/**
	 * The severity of reported trailing commas. If not set, trailing commas will be reported as errors.
	 */
	trailingCommas?: SeverityLevel;

	/**
	 * The severity of problems from schema validation. If set to 'ignore', schema validation will be skipped. If not set, 'warning' is used.
	 */
	schemaValidation?: SeverityLevel;

	/**
	 * The severity of problems that occurred when resolving and loading schemas. If set to 'ignore', schema resolving problems are not reported. If not set, 'warning' is used.
	 */
	schemaRequest?: SeverityLevel;

	/**
	 * The draft version of schema to use if the schema doesn't specify one at $schema
	 */
	schemaDraft?: SchemaDraft;
}

export interface SchemaConfiguration {
	/**
	 * The URI of the schema, which is also the identifier of the schema.
	 */
	uri: string;
	/**
	 * A list of glob patterns that describe for which file URIs the JSON schema will be used.
	 * '*' and '**' wildcards are supported. Exclusion patterns start with '!'.
	 * For example '*.schema.json', 'package.json', '!foo*.schema.json', 'foo/**\/BADRESP.json'.
	 * A match succeeds when there is at least one pattern matching and last matching pattern does not start with '!'.
	 */
	fileMatch?: string[];
	/**
	 * The schema for the given URI.
	 * If no schema is provided, the schema will be fetched with the schema request service (if available).
	 */
	schema?: JSONSchema;
	/**
	 * A parent folder for folder specifc associations. An association that has a folder URI set is only used
	 * if the document that is validated has the folderUri as parent
	 */
	folderUri?: string;
}

export interface WorkspaceContextService {
	resolveRelativePath(relativePath: string, resource: string): string;
}
/**
 * The schema request service is used to fetch schemas. If successful, returns a resolved promise with the content of the schema.
 * In case of an error, returns a rejected promise with a displayable error string.
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
	new <T>(executor: (resolve: (value?: T | Thenable<T | undefined>) => void, reject: (reason?: any) => void) => void): Thenable<T | undefined>;

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
	 * The schema request service is used to fetch schemas from a URI. The provider returns the schema file content, or,
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
	/**
	 * Describes the LSP capabilities the client supports.
	 */
	clientCapabilities?: ClientCapabilities;
}

/**
 * Describes what LSP capabilities the client supports
 */
export interface ClientCapabilities {
	/**
	 * The text document client capabilities
	 */
	textDocument?: {
		/**
		 * Capabilities specific to completions.
		 */
		completion?: {
			/**
			 * The client supports the following `CompletionItem` specific
			 * capabilities.
			 */
			completionItem?: {
				/**
				 * Client supports the follow content formats for the documentation
				 * property. The order describes the preferred format of the client.
				 */
				documentationFormat?: MarkupKind[];

				/**
				 * The client supports commit characters on a completion item.
				 */
				commitCharactersSupport?: boolean;

				/**
				 * The client has support for completion item label
				 * details (see also `CompletionItemLabelDetails`).
				 */
				labelDetailsSupport?: boolean;
			};

		};
		/**
		 * Capabilities specific to hovers.
		 */
		hover?: {
			/**
			 * Client supports the follow content formats for the content
			 * property. The order describes the preferred format of the client.
			 */
			contentFormat?: MarkupKind[];
		};
	};
}

export namespace ClientCapabilities {
	export const LATEST: ClientCapabilities = {
		textDocument: {
			completion: {
				completionItem: {
					documentationFormat: [MarkupKind.Markdown, MarkupKind.PlainText],
					commitCharactersSupport: true,
					labelDetailsSupport: true
				}
			}
		}
	};
}

export interface FoldingRangesContext {
	/**
	 * The maximal number of ranges returned.
	 */
	rangeLimit?: number;
	/**
	 * Called when the result was cropped.
	 */
	onRangeLimitExceeded?: (uri: string) => void;
}

export interface DocumentSymbolsContext {
	/**
	 * The maximal number of document symbols returned.
	 */
	resultLimit?: number;
	/**
	 * Called when the result was cropped.
	 */
	onResultLimitExceeded?: (uri: string) => void;
}

export interface ColorInformationContext {
	/**
	 * The maximal number of color informations returned.
	 */
	resultLimit?: number;
	/**
	 * Called when the result was cropped.
	 */
	onResultLimitExceeded?: (uri: string) => void;
}

export interface FormattingOptions extends LSPFormattingOptions {
	insertFinalNewline?: boolean;
	keepLines?: boolean;
}

export interface SortOptions extends LSPFormattingOptions {
	insertFinalNewline?: boolean;
}
