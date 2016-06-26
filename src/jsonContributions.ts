/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Thenable} from './jsonLanguageService';
import {MarkedString, CompletionItem} from 'vscode-languageserver-types';

export interface JSONWorkerContribution {
	getInfoContribution(resource: string, location: JSONLocation) : Thenable<MarkedString[]>;
	collectPropertyCompletions(resource: string, location: JSONLocation, currentWord: string, addValue: boolean, isLast:boolean, result: CompletionsCollector) : Thenable<any>;
	collectValueCompletions(resource: string, location: JSONLocation, propertyKey: string, result: CompletionsCollector): Thenable<any>;
	collectDefaultCompletions(resource: string, result: CompletionsCollector): Thenable<any>;
	resolveCompletion?(item: CompletionItem): Thenable<CompletionItem>;
}
export interface JSONLocation {
	getSegments(): string[];
	matches(segments: string[]) : boolean;
}

export interface CompletionsCollector {
	add(suggestion: CompletionItem): void;
	error(message:string): void;
	log(message:string): void;
	setAsIncomplete(): void;
}