/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JSONCompletion } from './services/jsonCompletion';
import { JSONHover } from './services/jsonHover';
import { JSONValidation } from './services/jsonValidation';

import { JSONDocumentSymbols } from './services/jsonDocumentSymbols';
import { parse as parseJSON, newJSONDocument } from './parser/jsonParser';
import { schemaContributions } from './services/configuration';
import { JSONSchemaService } from './services/jsonSchemaService';
import { getFoldingRanges } from './services/jsonFolding';
import { getSelectionRanges } from './services/jsonSelectionRanges';

import { format as formatJSON, Range as JSONCRange } from 'jsonc-parser';
import {
	Thenable,
	ASTNode,
	Color, ColorInformation, ColorPresentation,
	LanguageServiceParams, LanguageSettings, DocumentLanguageSettings,
	FoldingRange, JSONSchema, SelectionRange, FoldingRangesContext, DocumentSymbolsContext, ColorInformationContext as DocumentColorsContext,
	TextDocument,
	Position, CompletionItem, CompletionList, Hover, Range, SymbolInformation, Diagnostic,
	TextEdit, FormattingOptions, DocumentSymbol, DefinitionLink, MatchingSchema, JSONLanguageStatus
} from './jsonLanguageTypes';
import { findLinks } from './services/jsonLinks';
import { DocumentLink } from 'vscode-languageserver-types';

export type JSONDocument = {
	root: ASTNode | undefined;
	getNodeFromOffset(offset: number, includeRightBound?: boolean): ASTNode | undefined;
};
export * from './jsonLanguageTypes';

export interface LanguageService {
	configure(settings: LanguageSettings): void;
	doValidation(document: TextDocument, jsonDocument: JSONDocument, documentSettings?: DocumentLanguageSettings, schema?: JSONSchema): Thenable<Diagnostic[]>;
	parseJSONDocument(document: TextDocument): JSONDocument;
	newJSONDocument(rootNode: ASTNode, syntaxDiagnostics?: Diagnostic[]): JSONDocument;
	resetSchema(uri: string): boolean;
	getMatchingSchemas(document: TextDocument, jsonDocument: JSONDocument, schema?: JSONSchema): Thenable<MatchingSchema[]>;
	getLanguageStatus(document: TextDocument, jsonDocument: JSONDocument): JSONLanguageStatus;
	doResolve(item: CompletionItem): Thenable<CompletionItem>;
	doComplete(document: TextDocument, position: Position, doc: JSONDocument): Thenable<CompletionList | null>;
	findDocumentSymbols(document: TextDocument, doc: JSONDocument, context?: DocumentSymbolsContext): SymbolInformation[];
	findDocumentSymbols2(document: TextDocument, doc: JSONDocument, context?: DocumentSymbolsContext): DocumentSymbol[];
	findDocumentColors(document: TextDocument, doc: JSONDocument, context?: DocumentColorsContext): Thenable<ColorInformation[]>;
	getColorPresentations(document: TextDocument, doc: JSONDocument, color: Color, range: Range): ColorPresentation[];
	doHover(document: TextDocument, position: Position, doc: JSONDocument): Thenable<Hover | null>;
	format(document: TextDocument, range: Range, options: FormattingOptions): TextEdit[];
	getFoldingRanges(document: TextDocument, context?: FoldingRangesContext): FoldingRange[];
	getSelectionRanges(document: TextDocument, positions: Position[], doc: JSONDocument): SelectionRange[];
	findDefinition(document: TextDocument, position: Position, doc: JSONDocument): Thenable<DefinitionLink[]>;
	findLinks(document: TextDocument, doc: JSONDocument): Thenable<DocumentLink[]>;
}


export function getLanguageService(params: LanguageServiceParams): LanguageService {
	const promise = params.promiseConstructor || Promise;

	const jsonSchemaService = new JSONSchemaService(params.schemaRequestService, params.workspaceContext, promise);
	jsonSchemaService.setSchemaContributions(schemaContributions);

	const jsonCompletion = new JSONCompletion(jsonSchemaService, params.contributions, promise, params.clientCapabilities);
	const jsonHover = new JSONHover(jsonSchemaService, params.contributions, promise);
	const jsonDocumentSymbols = new JSONDocumentSymbols(jsonSchemaService);
	const jsonValidation = new JSONValidation(jsonSchemaService, promise);

	return {
		configure: (settings: LanguageSettings) => {
			jsonSchemaService.clearExternalSchemas();
			settings.schemas?.forEach(jsonSchemaService.registerExternalSchema.bind(jsonSchemaService));
			jsonValidation.configure(settings);
		},
		resetSchema: (uri: string) => jsonSchemaService.onResourceChange(uri),
		doValidation: jsonValidation.doValidation.bind(jsonValidation),
		getLanguageStatus: jsonValidation.getLanguageStatus.bind(jsonValidation),
		parseJSONDocument: (document: TextDocument) => parseJSON(document, { collectComments: true }),
		newJSONDocument: (root: ASTNode, diagnostics: Diagnostic[]) => newJSONDocument(root, diagnostics),
		getMatchingSchemas: jsonSchemaService.getMatchingSchemas.bind(jsonSchemaService),
		doResolve: jsonCompletion.doResolve.bind(jsonCompletion),
		doComplete: jsonCompletion.doComplete.bind(jsonCompletion),
		findDocumentSymbols: jsonDocumentSymbols.findDocumentSymbols.bind(jsonDocumentSymbols),
		findDocumentSymbols2: jsonDocumentSymbols.findDocumentSymbols2.bind(jsonDocumentSymbols),
		findDocumentColors: jsonDocumentSymbols.findDocumentColors.bind(jsonDocumentSymbols),
		getColorPresentations: jsonDocumentSymbols.getColorPresentations.bind(jsonDocumentSymbols),
		doHover: jsonHover.doHover.bind(jsonHover),
		getFoldingRanges,
		getSelectionRanges,
		findDefinition: () => Promise.resolve([]),
		findLinks,
		format: (d, r, o) => {
			let range: JSONCRange | undefined = undefined;
			if (r) {
				const offset = d.offsetAt(r.start);
				const length = d.offsetAt(r.end) - offset;
				range = { offset, length };
			}
			const options = { tabSize: o ? o.tabSize : 4, insertSpaces: o?.insertSpaces === true, insertFinalNewline: o?.insertFinalNewline === true, eol: '\n', keepLines : o?.keepLines === true };
			return formatJSON(d.getText(), range, options).map(e => {
				return TextEdit.replace(Range.create(d.positionAt(e.offset), d.positionAt(e.offset + e.length)), e.content);
			});
		}
	};
}
