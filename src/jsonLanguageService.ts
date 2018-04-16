/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {
	TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic,
	TextEdit, FormattingOptions, MarkedString
} from 'vscode-languageserver-types';

import { JSONCompletion } from './services/jsonCompletion';
import { JSONHover } from './services/jsonHover';
import { JSONValidation } from './services/jsonValidation';

import { JSONDocumentSymbols } from './services/jsonDocumentSymbols';
import { parse as parseJSON, JSONDocumentConfig, JSONDocument as InternalJSONDocument, newJSONDocument } from './parser/jsonParser';
import { schemaContributions } from './services/configuration';
import { JSONSchemaService } from './services/jsonSchemaService';
import { getFoldingRanges } from './services/jsonFolding';

import { format as formatJSON } from 'jsonc-parser';
import { format } from 'util';
import {
	PromiseConstructor, Thenable,
	SchemaConfiguration, SchemaRequestService,
	ASTNode,
	Color, ColorInformation, ColorPresentation,
	ErrorCode, LanguageServiceParams, LanguageSettings, DocumentLanguageSettings, SeverityLevel,
	FoldingRange, FoldingRangeList, FoldingRangeType, JSONSchema
} from './jsonLanguageTypes';

export type JSONDocument = {};
export * from './jsonLanguageTypes';

export {
	TextDocument, Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic,
	TextEdit, FormattingOptions, MarkedString
};

export interface LanguageService {
	configure(settings: LanguageSettings): void;
	doValidation(document: TextDocument, jsonDocument: JSONDocument, documentSettings?: DocumentLanguageSettings, schema?: JSONSchema): Thenable<Diagnostic[]>;
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
	getFoldingRanges(document: TextDocument, context?: { maxRanges?: number }): FoldingRangeList;
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
		getFoldingRanges: getFoldingRanges,
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
