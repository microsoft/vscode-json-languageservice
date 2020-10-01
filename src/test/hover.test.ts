/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as Parser from '../parser/jsonParser';
import * as SchemaService from '../services/jsonSchemaService';
import * as JsonSchema from '../jsonSchema';
import { JSONHover } from '../services/jsonHover';

import { Hover, Position, MarkedString, TextDocument } from '../jsonLanguageService';
import { JSONWorkerContribution, MarkupKind } from "../jsonLanguageTypes";

suite('JSON Hover', () => {

	function testComputeInfo(
		value: string,
		schema: JsonSchema.JSONSchema,
		position: Position,
		contributions: JSONWorkerContribution[] = [],
	): PromiseLike<Hover> {
		const uri = 'test://test.json';

		const schemaService = new SchemaService.JSONSchemaService(requestService);
		const hoverProvider = new JSONHover(schemaService, contributions, Promise);
		const id = "http://myschemastore/test1";
		schemaService.registerExternalSchema(id, ["*.json"], schema);

		const document = TextDocument.create(uri, 'json', 0, value);
		const jsonDoc = Parser.parse(document);
		return hoverProvider.doHover(document, position, jsonDoc);
	}

	let requestService = function (uri: string): Promise<string> {
		return Promise.reject<string>('Resource not found');
	};

	test('Simple schema', async function () {

		const content = '{"a": 42, "b": "hello", "c": false}';
		const schema: JsonSchema.JSONSchema = {
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
		await testComputeInfo(content, schema, { line: 0, character: 0 }).then((result) => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.PlainText, value: MarkedString.fromPlainText('a very special object') });
		});
		await testComputeInfo(content, schema, { line: 0, character: 1 }).then((result) => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.PlainText, value: MarkedString.fromPlainText('A') });
		});
		await testComputeInfo(content, schema, { line: 0, character: 32 }).then((result) => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.PlainText, value: MarkedString.fromPlainText('C') });
		});
		await testComputeInfo(content, schema, { line: 0, character: 7 }).then((result) => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.PlainText, value: MarkedString.fromPlainText('A') });
		});
	});

	test('Nested schema', async function () {

		const content = '{"a": 42, "b": "hello"}';
		const schema: JsonSchema.JSONSchema = {
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
		await testComputeInfo(content, schema, { line: 0, character: 0 }).then((result) => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.PlainText, value: MarkedString.fromPlainText('a very special object') });
		});
		await testComputeInfo(content, schema, { line: 0, character: 1 }).then((result) => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.PlainText, value: MarkedString.fromPlainText('A') });
		});
		await testComputeInfo(content, schema, { line: 0, character: 10 }).then((result) => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.PlainText, value: MarkedString.fromPlainText('B\n\nIt\'s B') });
		});
	});

	test('Enum description', async function () {
		const schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'prop1': {
					description: "prop1",
					enum: ['e1', 'e2', 'e3'],
					enumDescriptions: ['E1', 'E2', 'E3'],
				},
				'prop2': {
					description: "prop2",
					enum: [null, 1, false],
					enumDescriptions: ['null', 'one', 'wrong'],
				},
				'prop3': {
					title: "title",
					markdownDescription: "*prop3*",
					description: "prop3",
					enum: [null, 1],
					markdownEnumDescriptions: ['Set to `null`', 'Set to `1`'],
				}
			}
		};

		await testComputeInfo('{ "prop1": "e1', schema, { line: 0, character: 12 }).then(result => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.Markdown, value: 'prop1\n\n`e1`: E1' });
		});
		await testComputeInfo('{ "prop2": null', schema, { line: 0, character: 12 }).then(result => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.Markdown, value: 'prop2\n\n`null`: null' });
		});
		await testComputeInfo('{ "prop2": 1', schema, { line: 0, character: 11 }).then(result => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.Markdown, value: 'prop2\n\n`1`: one' });
		});
		await testComputeInfo('{ "prop2": false', schema, { line: 0, character: 12 }).then(result => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.Markdown, value: 'prop2\n\n`false`: wrong' });
		});
		await testComputeInfo('{ "prop3": null', schema, { line: 0, character: 12 }).then(result => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.Markdown, value: 'title\n\n*prop3*\n\n`null`: Set to `null`' });
		});
	});

	test('Multiline descriptions', async function () {
		const schema: JsonSchema.JSONSchema = {
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

		await testComputeInfo('{ "prop1": "e1', schema, { line: 0, character: 12 }).then(result => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.PlainText, value: 'line1\nline2\n\nline3\n\n\nline4\n' });
		});
		await testComputeInfo('{ "prop2": "e1', schema, { line: 0, character: 12 }).then(result => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.PlainText, value: 'line1\r\nline2\r\n\r\nline3' });
		});
	});

	test('Markdown descriptions', async function () {
		const schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'prop1': {
					markdownDescription: "line1\nline2\n\n`line3`\n\n\nline4\n",
				},
				'prop2': {
					title: `Title with *markdown* characters`,
					markdownDescription: "line1\r\n*line2*\r\n\r\n`line3`",
				}
			}
		};

		await testComputeInfo('{ "prop1": "e1', schema, { line: 0, character: 12 }).then(result => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.Markdown, value: 'line1\nline2\n\n`line3`\n\n\nline4\n' });
		});
		await testComputeInfo('{ "prop2": "e1', schema, { line: 0, character: 12 }).then(result => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.Markdown, value: 'Title with \\*markdown\\* characters\n\nline1\r\n*line2*\r\n\r\n`line3`' });
		});
	});

	test("Hover contributions", async () => {
		const content = '{"a": 42, "b": "hello", "c": false}';
		const schema: JsonSchema.JSONSchema = {};
		const contribution: JSONWorkerContribution = {
			async getInfoContribution(uri, location) {
				return {
					kind: MarkupKind.PlainText,
					value: "Custom contribution info"
				};
			},
			async collectPropertyCompletions(uri, location, currentWord, addValue, isLast, result) {
				assert.fail();
			},
			async collectValueCompletions(uri, location, propertyKey, result) {
				assert.fail();
			},
			async collectDefaultCompletions(uri, result) {
				assert.fail();
			},
			async resolveCompletion(item) {
				assert.fail();
			}
		};
		await testComputeInfo(content, schema, { line: 0, character: 7 }, [contribution]).then((result) => {
			assert.deepStrictEqual(result.contents, { kind: MarkupKind.PlainText, value: 'Custom contribution info' });
		});
	});
});
