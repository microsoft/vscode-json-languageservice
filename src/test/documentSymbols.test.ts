/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import Parser = require('../parser/jsonParser');
import SchemaService = require('../services/jsonSchemaService');
import JsonSchema = require('../jsonSchema');
import { JSONCompletion } from '../services/jsonCompletion';
import { JSONDocumentSymbols } from '../services/jsonDocumentSymbols';

import { SymbolInformation, SymbolKind, TextDocumentIdentifier, TextDocument, Range, Position, TextEdit } from 'vscode-languageserver-types';
import { Thenable, Color } from "../jsonLanguageService";
import { colorFrom256RGB } from '../utils/colors';

suite('JSON Document Symbols', () => {

	let requestService = function (uri: string): Promise<string> {
		return Promise.reject<string>('Resource not found');
	}

	function getOutline(value: string): SymbolInformation[] {
		var uri = 'test://test.json';
		var schemaService = new SchemaService.JSONSchemaService(requestService);

		var symbolProvider = new JSONDocumentSymbols(schemaService);

		var document = TextDocument.create(uri, 'json', 0, value);
		var jsonDoc = Parser.parse(value);
		return symbolProvider.findDocumentSymbols(document, jsonDoc);
	}

	function assertColors(value: string, schema: JsonSchema.JSONSchema, expectedOffsets: number[], expectedColors: Color[]): Thenable<any> {
		var uri = 'test://test.json';
		var schemaService = new SchemaService.JSONSchemaService(requestService);

		var id = "http://myschemastore/test1";
		schemaService.registerExternalSchema(id, ["*.json"], schema);
		var symbolProvider = new JSONDocumentSymbols(schemaService);

		var document = TextDocument.create(uri, 'json', 0, value);
		var jsonDoc = Parser.parse(value);
		return symbolProvider.findDocumentColors(document, jsonDoc).then(colorInfos => {
			let actualOffsets = colorInfos.map(r => document.offsetAt(r.range.start));
			assert.deepEqual(actualOffsets, expectedOffsets);
			let actualColors = colorInfos.map(r => r.color);
			assert.deepEqual(actualColors, expectedColors);			
		})
	}

	function assertOutline(value: string, expected: any[], message?: string) {
		var actual = getOutline(value);

		assert.equal(actual.length, expected.length, message);
		for (var i = 0; i < expected.length; i++) {
			assert.equal(actual[i].name, expected[i].label, message);
			assert.equal(actual[i].kind, expected[i].kind, message);
		}
	};


	test('Base types', function () {
		var content = '{ "key1": 1, "key2": "foo", "key3" : true }';

		var expected = [
			{ label: 'key1', kind: SymbolKind.Number },
			{ label: 'key2', kind: SymbolKind.String },
			{ label: 'key3', kind: SymbolKind.Boolean },
		];

		assertOutline(content, expected);
	});

	test('Arrays', function () {
		var content = '{ "key1": 1, "key2": [ 1, 2, 3 ], "key3" : [ { "k1": 1 }, {"k2": 2 } ] }';

		var expected = [
			{ label: 'key1', kind: SymbolKind.Number },
			{ label: 'key2', kind: SymbolKind.Array },
			{ label: 'key3', kind: SymbolKind.Array },
			{ label: 'k1', kind: SymbolKind.Number },
			{ label: 'k2', kind: SymbolKind.Number }
		];

		assertOutline(content, expected);
	});

	test('Objects', function () {
		var content = '{ "key1": { "key2": true }, "key3" : { "k1":  { } }';

		var expected = [
			{ label: 'key1', kind: SymbolKind.Module },
			{ label: 'key2', kind: SymbolKind.Boolean },
			{ label: 'key3', kind: SymbolKind.Module },
			{ label: 'k1', kind: SymbolKind.Module }
		];

		assertOutline(content, expected);
	});

	test('Outline - object with syntax error', function () {
		var content = '{ "key1": { "key2": true, "key3":, "key4": false } }';

		var expected = [
			{ label: 'key1', kind: SymbolKind.Module },
			{ label: 'key2', kind: SymbolKind.Boolean },
			{ label: 'key4', kind: SymbolKind.Boolean },
		];

		assertOutline(content, expected);
	});

	test('Colors', function (done) {
		var content = '{ "a": "#FF00FF", "b": "#FF0000" }';
		var schema: JsonSchema.JSONSchema = {
			type: 'object',
			description: 'a very special object',
			properties: {
				'a': {
					type: 'number',
					description: 'A',
					format: 'color'
				},
				'b': {
					type: 'string',
					description: 'B',
					format: 'color'
				}
			}
		};

		var expectedOffsets = [7, 23];
		var expectedColors = [ colorFrom256RGB(255, 0, 255), colorFrom256RGB(255, 0, 0)];
		assertColors(content, schema, expectedOffsets, expectedColors).then(_ => done(), e => done(e));
	});

});