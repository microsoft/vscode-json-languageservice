/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { MarkedString, CompletionItem } from './jsonLanguageService';

export interface JSONWorkerContribution {
	getInfoContribution(uri: string, location: JSONPath): PromiseLike<MarkedString[]>;
	collectPropertyCompletions(uri: string, location: JSONPath, currentWord: string, addValue: boolean, isLast: boolean, result: CompletionsCollector): PromiseLike<any>;
	collectValueCompletions(uri: string, location: JSONPath, propertyKey: string, result: CompletionsCollector): PromiseLike<any>;
	collectDefaultCompletions(uri: string, result: CompletionsCollector): PromiseLike<any>;
	resolveCompletion?(item: CompletionItem): PromiseLike<CompletionItem>;
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
