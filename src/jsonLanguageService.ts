/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic,
	TextEdit, FormattingOptions} from 'vscode-languageserver-types';

import {JSONCompletion} from './services/jsonCompletion';
import {JSONHover} from './services/jsonHover';
import {JSONValidation} from './services/jsonValidation';
import {JSONSchema} from './jsonSchema';
import {JSONDocumentSymbols} from './services/jsonDocumentSymbols';
import {parse as parseJSON, JSONDocument} from './parser/jsonParser';
import {schemaContributions} from './services/configuration';
import {XHROptions, XHRResponse} from 'request-light';
import {JSONSchemaService} from './services/jsonSchemaService';
import {JSONWorkerContribution} from './jsonContributions';
import {format as formatJSON} from './services/jsonFormatter';

export type JSONDocument = {};
export {JSONSchema, JSONWorkerContribution, XHROptions, XHRResponse};
export {TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic,
	TextEdit, FormattingOptions};

export interface LanguageService {
	configure(settings: LanguageSettings): void;
	doValidation(document: TextDocument, jsonDocument: JSONDocument): Thenable<Diagnostic[]>;
	parseJSONDocument(document: TextDocument): JSONDocument;
	resetSchema(uri: string): boolean;
	doResolve(item: CompletionItem): Thenable<CompletionItem>;
	doComplete(document: TextDocument, position: Position, doc: JSONDocument): Thenable<CompletionList>;
	findDocumentSymbols(document: TextDocument, doc: JSONDocument): SymbolInformation[];
	doHover(document: TextDocument, position: Position, doc: JSONDocument): Thenable<Hover>;
	format(document: TextDocument, range: Range, options: FormattingOptions): Thenable<TextEdit[]>;
}

export interface LanguageSettings {
	validate?: boolean;
	schemas?: SchemaConfiguration[];
}

export interface SchemaConfiguration {
	uri: string;
	fileMatch?: string[];
	schema?: JSONSchema;
}

export interface TelemetryService {
	log(key: string, data: any): void;
}

export interface WorkspaceContextService {
	resolveRelativePath(relativePath: string, resource: string): string;
}

export interface RequestService {
	(options: XHROptions): Thenable<XHRResponse>;
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
	request: RequestService;
	workspaceContext?: WorkspaceContextService;
	telemetry?: TelemetryService;
	contributions?: JSONWorkerContribution[];
	promiseConstructor?: PromiseConstructor;
}

export function getLanguageService(params: LanguageServiceParams): LanguageService {
	let promise = params.promiseConstructor || Promise;

	let jsonSchemaService = new JSONSchemaService(params.request, params.workspaceContext, params.telemetry, promise);
	jsonSchemaService.setSchemaContributions(schemaContributions);

	let jsonCompletion = new JSONCompletion(jsonSchemaService, params.contributions, promise);
	let jsonHover = new JSONHover(jsonSchemaService, params.contributions, promise);
	let jsonDocumentSymbols = new JSONDocumentSymbols();
	let jsonValidation = new JSONValidation(jsonSchemaService, promise);

	return {
		configure: (settings: LanguageSettings) => {
			jsonSchemaService.clearExternalSchemas();
			if (settings.schemas) {
				settings.schemas.forEach(settings => {
					jsonSchemaService.registerExternalSchema(settings.uri, settings.fileMatch, settings.schema);
				});
			}
		},
		resetSchema: (uri: string) => {
			return jsonSchemaService.onResourceChange(uri);
		},
		doValidation: jsonValidation.doValidation.bind(jsonValidation),
		parseJSONDocument: (document: TextDocument) => parseJSON(document.getText()),
		doResolve: jsonCompletion.doResolve.bind(jsonCompletion),
		doComplete: jsonCompletion.doComplete.bind(jsonCompletion),
		findDocumentSymbols: jsonDocumentSymbols.findDocumentSymbols.bind(jsonDocumentSymbols),
		doHover: jsonHover.doHover.bind(jsonHover),
		format: (document, range, options) => promise.resolve(formatJSON(document, range, options))
	};
}
