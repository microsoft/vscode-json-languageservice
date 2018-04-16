/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { JSONWorkerContribution, JSONPath, Segment, CompletionsCollector } from './jsonContributions';
import { JSONSchema } from './jsonSchema';
import { Range, TextEdit } from 'vscode-languageserver-types';

export { Range, TextEdit, JSONSchema, JSONWorkerContribution, JSONPath, Segment, CompletionsCollector };

/**
 * Error codes used by diagnostics
 */
export enum ErrorCode {
	Undefined = 0,
	EnumValueMismatch = 1,
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
	SchemaResolveError = 0x300
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

export interface FoldingRangeList {
    /**
     * The folding ranges.
     */
	ranges: FoldingRange[];
}
export const enum FoldingRangeType {
    /**
     * Folding range for a comment
     */
	Comment = "comment",
    /**
     * Folding range for a imports or includes
     */
	Imports = "imports",
    /**
     * Folding range for a region (e.g. `#region`)
     */
	Region = "region",
}
/**
 * Represents a folding range.
 */
export interface FoldingRange {
    /**
     * The start line number of the folding range.
     */
	startLine: number;
    /**
     * The start column of the folding range. If not set, this defaults to the length of the start line.
     */
	startColumn?: number;
    /**
     * The end line number. The last line will be hidden.
     */
	endLine: number;
    /**
     * The start column of the folding range. If not set, this defaults to the length of the end line.
     */
	endColumn?: number;
    /**
     * The type of folding range.
     */
	type?: FoldingRangeType | string;
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


