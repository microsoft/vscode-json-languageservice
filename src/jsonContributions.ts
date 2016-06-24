/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {JSONLocation} from './parser/jsonLocation';

import {MarkedString, CompletionItem} from 'vscode-languageserver-types';

export interface IJSONWorkerContribution {
	getInfoContribution(resource: string, location: JSONLocation) : Thenable<MarkedString[]>;
	collectPropertySuggestions(resource: string, location: JSONLocation, currentWord: string, addValue: boolean, isLast:boolean, result: ISuggestionsCollector) : Thenable<any>;
	collectValueSuggestions(resource: string, location: JSONLocation, propertyKey: string, result: ISuggestionsCollector): Thenable<any>;
	collectDefaultSuggestions(resource: string, result: ISuggestionsCollector): Thenable<any>;
	resolveSuggestion?(item: CompletionItem): Thenable<CompletionItem>;
}

export interface ISuggestionsCollector {
	add(suggestion: CompletionItem): void;
	error(message:string): void;
	log(message:string): void;
	setAsIncomplete(): void;
}