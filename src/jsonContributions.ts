/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Thenable, MarkedString, CompletionItem } from './jsonLanguageService';

export interface JSONWorkerContribution {
	getInfoContribution(uri: string, location: JSONPath): Thenable<MarkedString[]>;
	collectPropertyCompletions(uri: string, location: JSONPath, currentWord: string, addValue: boolean, isLast: boolean, result: CompletionsCollector): Thenable<any>;
	collectValueCompletions(uri: string, location: JSONPath, propertyKey: string, result: CompletionsCollector): Thenable<any>;
	collectDefaultCompletions(uri: string, result: CompletionsCollector): Thenable<any>;
	resolveCompletion?(item: CompletionItem): Thenable<CompletionItem>;
}
export type Segment = string | number;
export type JSONPath = Segment[];

export type JSONCompletionItem = CompletionItem & { insertText: string };

export interface CompletionsCollector {
	add(suggestion: JSONCompletionItem & { insertText: string}): void;
	error(message: string): void;
	setAsIncomplete(): void;
	getNumberOfProposals(): number;
}
