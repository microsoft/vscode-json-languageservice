/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import Parser = require('../parser/jsonParser');
import SchemaService = require('../services/jsonSchemaService');
import JsonSchema = require('../jsonSchema');
import {JSONCompletion} from '../services/jsonCompletion';
import {JSONHover} from '../services/jsonHover';

import {Hover, TextDocument, TextDocumentIdentifier, Range, Position, TextEdit, MarkedString} from 'vscode-languageserver-types';

suite('JSON Hover', () => {

	function testComputeInfo(value: string, schema: JsonSchema.JSONSchema, position: Position): PromiseLike<Hover> {
		var uri = 'test://test.json';

		var schemaService = new SchemaService.JSONSchemaService(requestService);
		var hoverProvider = new JSONHover(schemaService, [], Promise);
		var id = "http://myschemastore/test1";
		schemaService.registerExternalSchema(id, ["*.json"], schema);

		var document = TextDocument.create(uri, 'json', 0, value);
		var jsonDoc = Parser.parse(value);
		return hoverProvider.doHover(document, position, jsonDoc);
	}

	let requestService = function(uri: string): Promise<string> {
		return Promise.reject<string>('Resource not found');
	}

	test('Simple schema', function(testDone) {

		var content = '{"a": 42, "b": "hello", "c": false}';
		var schema: JsonSchema.JSONSchema = {
			type: 'object',
			description: 'a very special object',
			properties: {
				'a': {
					type: 'number',
					description: 'A'
				},
				'b': {
					type: 'string',
					description: 'B'
				},
				'c': {
					type: 'boolean',
					description: 'C'
				}
			}
		};
		Promise.all([
			testComputeInfo(content, schema, { line: 0, character: 0 }).then((result) => {
				assert.deepEqual(result.contents, [ MarkedString.fromPlainText('a very special object')]);
			}),
			testComputeInfo(content, schema, { line: 0, character: 1 }).then((result) => {
				assert.deepEqual(result.contents, [ MarkedString.fromPlainText('A')]);
			}),
			testComputeInfo(content, schema, { line: 0, character: 32 }).then((result) => {
				assert.deepEqual(result.contents, [ MarkedString.fromPlainText('C')]);
			}),
			testComputeInfo(content, schema, { line: 0, character: 7 }).then((result) => {
				assert.deepEqual(result.contents, [ MarkedString.fromPlainText('A')]);
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Nested schema', function(testDone) {

		var content = '{"a": 42, "b": "hello"}';
		var schema: JsonSchema.JSONSchema = {
			oneOf: [{
				type: 'object',
				description: 'a very special object',
				properties: {
					'a': {
						type: 'number',
						description: 'A'
					},
					'b': {
						type: 'string',
						title: 'B',
						description: 'It\'s B'
					},
				}
			}, {
					type: 'array'
				}]
		};
		Promise.all([
			testComputeInfo(content, schema, { line: 0, character: 0 }).then((result) => {
				assert.deepEqual(result.contents, [ MarkedString.fromPlainText('a very special object') ]);
			}),
			testComputeInfo(content, schema, { line: 0, character: 1 }).then((result) => {
				assert.deepEqual(result.contents, [ MarkedString.fromPlainText('A') ]);
			}),
			testComputeInfo(content, schema, { line: 0, character: 10 }).then((result) => {
				assert.deepEqual(result.contents, [ MarkedString.fromPlainText('B\n\nIt\'s B') ]);
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Enum description', function(testDone) {
		var schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'prop1': {
					description: "prop1",
					enum: ['e1', 'e2', 'e3' ],
					enumDescriptions: ['E1', 'E2', 'E3' ],
				},
				'prop2': {
					description: "prop2",
					enum: [null, 1, false ],
					enumDescriptions: ['null', 'one', 'wrong' ],
				},
				'prop3': {
					title: "title",
					markdownDescription: "*prop3*",
					description: "prop3",
					enum: [null, 1 ],
					markdownEnumDescriptions: ['Set to `null`', 'Set to `1`' ],
				}
			}
		};

		Promise.all([
			testComputeInfo('{ "prop1": "e1', schema, { line: 0, character: 12 }).then(result => {
				assert.deepEqual(result.contents, [ 'prop1\n\n`e1`: E1' ]);
			}),
			testComputeInfo('{ "prop2": null', schema, { line: 0, character: 12 }).then(result => {
				assert.deepEqual(result.contents, [ 'prop2\n\n`null`: null' ]);
			}),
			testComputeInfo('{ "prop2": 1', schema, { line: 0, character: 11 }).then(result => {
				assert.deepEqual(result.contents, [ 'prop2\n\n`1`: one' ]);
			}),
			testComputeInfo('{ "prop2": false', schema, { line: 0, character: 12 }).then(result => {
				assert.deepEqual(result.contents, [ 'prop2\n\n`false`: wrong' ]);
			}),
			testComputeInfo('{ "prop3": null', schema, { line: 0, character: 12 }).then(result => {
				assert.deepEqual(result.contents, [ 'title\n\n*prop3*\n\n`null`: Set to `null`' ]);
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Multiline descriptions', function (testDone) {
		var schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'prop1': {
					description: "line1\nline2\n\nline3\n\n\nline4\n",
				},
				'prop2': {
					description: "line1\r\nline2\r\n\r\nline3",
				}
			}
		};

		Promise.all([
			testComputeInfo('{ "prop1": "e1', schema, { line: 0, character: 12 }).then(result => {
				assert.deepEqual(result.contents, [ 'line1\n\nline2\n\nline3\n\n\nline4\n']);
			}),
			testComputeInfo('{ "prop2": "e1', schema, { line: 0, character: 12 }).then(result => {
				assert.deepEqual(result.contents, [ 'line1\n\nline2\r\n\r\nline3' ]);
			})
		]).then(() => testDone(), (error) => testDone(error));
	});	
})