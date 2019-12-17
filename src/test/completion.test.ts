/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { getLanguageService, JSONSchema, TextDocument, ClientCapabilities, CompletionList, CompletionItemKind, Position, MarkupContent } from '../jsonLanguageService';
import { repeat } from '../utils/strings';

const applyEdits = TextDocument.applyEdits;

interface ItemDescription {
	label: string;
	detail?: string;
	documentation?: string | MarkupContent;
	kind?: CompletionItemKind;
	resultText?: string;
	notAvailable?: boolean;
}

let assertCompletion = function (completions: CompletionList, expected: ItemDescription, document: TextDocument, offset: number) {
	let matches = completions.items.filter(completion => {
		return completion.label === expected.label;
	});
	if (expected.notAvailable) {
		assert.equal(matches.length, 0, expected.label + " should not existing is results");
		return;
	}
	assert.equal(matches.length, 1, expected.label + " should only existing once: Actual: " + completions.items.map(c => c.label).join(', '));
	let match = matches[0];
	if (expected.detail) {
		assert.equal(match.detail, expected.detail);
	}
	if (expected.documentation) {
		assert.deepEqual(match.documentation, expected.documentation);
	}
	if (expected.kind) {
		assert.equal(match.kind, expected.kind);
	}
	if (expected.resultText) {
		assert.equal(applyEdits(document, [match.textEdit]), expected.resultText);
	}
};

suite('JSON Completion', () => {

	let testCompletionsFor = function (value: string, schema: JSONSchema, expected: { count?: number, items?: ItemDescription[] }, clientCapabilities = ClientCapabilities.LATEST): PromiseLike<void> {
		let offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		let ls = getLanguageService({ clientCapabilities });
		if (schema) {
			ls.configure({
				schemas: [{
					uri: 'http://myschemastore/test1',
					schema,
					fileMatch: ["*.json"]
				}]
			});
		}

		let document = TextDocument.create('test://test/test.json', 'json', 0, value);
		let position = Position.create(0, offset);
		let jsonDoc = ls.parseJSONDocument(document);
		return ls.doComplete(document, position, jsonDoc).then(list => {
			if (expected.count) {
				assert.equal(list.items.length, expected.count, value + ' ' + list.items.map(i => i.label).join(', '));
			}
			if (expected.items) {
				for (let item of expected.items) {
					assertCompletion(list, item, document, offset);
				}
			}
		});
	};

	test('Complete property no schema', async function () {
		await testCompletionsFor('[ { "name": "John", "age": 44 }, { | }', null, {
			count: 2,
			items: [
				{ label: 'name', resultText: '[ { "name": "John", "age": 44 }, { "name" }' },
				{ label: 'age', resultText: '[ { "name": "John", "age": 44 }, { "age" }' }
			]
		});
		await testCompletionsFor('[ { "name": "John", "age": 44 }, { "| }', null, {
			count: 2,
			items: [
				{ label: 'name', resultText: '[ { "name": "John", "age": 44 }, { "name"' },
				{ label: 'age', resultText: '[ { "name": "John", "age": 44 }, { "age"' }
			]
		});
		await testCompletionsFor('[ { "name": "John", "age": 44 }, { "n| }', null, {
			count: 2,
			items: [
				{ label: 'name', resultText: '[ { "name": "John", "age": 44 }, { "name"' },
				{ label: 'age', resultText: '[ { "name": "John", "age": 44 }, { "age"' }
			]
		});
		await testCompletionsFor('[ { "name": "John", "age": 44 }, { "name|" }', null, {
			count: 2,
			items: [
				{ label: 'name', resultText: '[ { "name": "John", "age": 44 }, { "name" }' },
				{ label: 'age', resultText: '[ { "name": "John", "age": 44 }, { "age" }' }
			]
		});
		await testCompletionsFor('[ { "name": "John", "age": 44, "city": "DC" }, { "name|": "Paul", "age": 23 }', null, {
			items: [
				{ label: 'city', resultText: '[ { "name": "John", "age": 44, "city": "DC" }, { "city": "Paul", "age": 23 }' },
			]
		});
		await testCompletionsFor('[ { "name": "John", "address": { "street" : "MH Road", "number" : 5 } }, { "name": "Jack", "address": { "street" : "100 Feet Road", | }', null, {
			count: 1,
			items: [
				{ label: 'number', resultText: '[ { "name": "John", "address": { "street" : "MH Road", "number" : 5 } }, { "name": "Jack", "address": { "street" : "100 Feet Road", "number" }' }
			]
		});
	});

	test('Complete values no schema', async function () {
		await testCompletionsFor('[ { "name": "John", "age": 44 }, { "name": |', null, {
			count: 1,
			items: [
				{ label: '"John"', resultText: '[ { "name": "John", "age": 44 }, { "name": "John"' }
			]
		});
		await testCompletionsFor('[ { "data": { "key": 1, "data": true } }, { "data": |', null, {
			count: 3,
			items: [
				{ label: '{}', resultText: '[ { "data": { "key": 1, "data": true } }, { "data": {$1}' },
				{ label: 'true', resultText: '[ { "data": { "key": 1, "data": true } }, { "data": true' },
				{ label: 'false', resultText: '[ { "data": { "key": 1, "data": true } }, { "data": false' }
			]
		});
		await testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "|" } ]', null, {
			count: 2,
			items: [
				{ label: '"foo"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "foo" } ]' },
				{ label: '"bar"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "bar" } ]' }
			]
		});
		await testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "f|" } ]', null, {
			count: 2,
			items: [
				{ label: '"foo"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "foo" } ]' },
				{ label: '"bar"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "bar" } ]' }
			]
		});
		await testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"|, "o": 1 } ]', null, {
			count: 2,
			items: [
				{ label: '"foo"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "foo", "o": 1 } ]' },
				{ label: '"bar"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "bar", "o": 1 } ]' }
			]
		});
		await testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"  | } ]', null, {
			count: 0
		});
	});

	test('Complete property with schema', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'a': {
					type: 'number',
					description: 'A'
				},
				'b': {
					type: 'string',
					description: 'B'
				},
				'cool': {
					type: 'boolean',
					description: 'C'
				}
			}
		};
		await testCompletionsFor('{|}', schema, {
			count: 3,
			items: [
				{ label: 'a', documentation: 'A', resultText: '{"a": ${1:0}}' },
				{ label: 'b', documentation: 'B', resultText: '{"b": "$1"}' },
				{ label: 'cool', documentation: 'C', resultText: '{"cool": $1}' }
			]
		});
		await testCompletionsFor('{ "a|}', schema, {
			count: 3,
			items: [
				{ label: 'a', documentation: 'A', resultText: '{ "a": ${1:0}' }
			]
		});
		await testCompletionsFor('{ "b": 1 "a|}', schema, {
			count: 2,
			items: [
				{ label: 'a', documentation: 'A', resultText: '{ "b": 1 "a": ${1:0}' }
			]
		});
		await testCompletionsFor('{ "|}', schema, {
			count: 3,
			items: [
				{ label: 'a', documentation: 'A', resultText: '{ "a": ${1:0}' }
			]
		});
		await testCompletionsFor('{ a|}', schema, {
			count: 3,
			items: [
				{ label: 'a', documentation: 'A', resultText: '{ "a": ${1:0}}' }
			]
		});
		await testCompletionsFor('{ "a": 1,|}', schema, {
			count: 2,
			items: [
				{ label: 'b', documentation: 'B', resultText: '{ "a": 1,"b": "$1"}' },
				{ label: 'cool', documentation: 'C', resultText: '{ "a": 1,"cool": $1}' }
			]
		});
		await testCompletionsFor('{ |, "a": 1}', schema, {
			count: 2,
			items: [
				{ label: 'b', documentation: 'B', resultText: '{ "b": "$1", "a": 1}' },
				{ label: 'cool', documentation: 'C', resultText: '{ "cool": $1, "a": 1}' }
			]
		});
		await testCompletionsFor('{ "a": 1 "b|"}', schema, {
			items: [
				{ label: 'b', documentation: 'B', resultText: '{ "a": 1 "b": "$1"}' },
			]
		});
		await testCompletionsFor('{ "c|"\n"b": "v"}', schema, {
			items: [
				{ label: 'a', resultText: '{ "a": ${1:0},\n"b": "v"}' },
				{ label: 'cool', resultText: '{ "cool": $1,\n"b": "v"}' },
				{ label: 'b', notAvailable: true }
			]
		});
		await testCompletionsFor('{ c|\n"b": "v"}', schema, {
			items: [
				{ label: 'a', resultText: '{ "a": ${1:0},\n"b": "v"}' },
				{ label: 'cool', resultText: '{ "cool": $1,\n"b": "v"}' },
				{ label: 'b', notAvailable: true }
			]
		});

	});

	test('Complete value with schema', async function () {

		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'a': {
					enum: ['John', 'Jeff', 'George']
				},
				'c': {
					type: 'array',
					items: {
						type: 'string'
					}
				}
			}
		};
		await testCompletionsFor('{ "a": | }', schema, {
			count: 3,
			items: [
				{ label: '"John"', resultText: '{ "a": "John" }' },
				{ label: '"Jeff"', resultText: '{ "a": "Jeff" }' },
				{ label: '"George"', resultText: '{ "a": "George" }' }
			]
		});

		await testCompletionsFor('{ "a": "J| }', schema, {
			count: 3,
			items: [
				{ label: '"John"', resultText: '{ "a": "John"' },
				{ label: '"Jeff"', resultText: '{ "a": "Jeff"' },
			]
		});
		await testCompletionsFor('{ "a": "John"|, "b": 1 }', schema, {
			count: 3,
			items: [
				{ label: '"John"', resultText: '{ "a": "John", "b": 1 }' }
			]
		});
	});

	test('Complete array value with schema', async function () {

		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'c': {
					type: 'array',
					items: {
						type: 'number',
						enum: [1, 2]
					}
				}
			}
		};
		await testCompletionsFor('{ "c": [ | ] }', schema, {
			items: [
				{ label: '1', resultText: '{ "c": [ 1 ] }' },
				{ label: '2', resultText: '{ "c": [ 2 ] }' }
			]
		});
		await testCompletionsFor('{ "c": [ 1, | ] }', schema, {
			items: [
				{ label: '1', resultText: '{ "c": [ 1, 1 ] }' },
				{ label: '2', resultText: '{ "c": [ 1, 2 ] }' }
			]
		});
		await testCompletionsFor('{ "c": [ | 1] }', schema, {
			items: [
				{ label: '1', resultText: '{ "c": [ 1, 1] }' },
				{ label: '2', resultText: '{ "c": [ 2, 1] }' }
			]
		});
	});

	test('Complete array value with schema 2', async function () {

		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'c': {
					type: 'array',
					items: [
						{ enum: [1, 2] }, { enum: [3, 4] }, { enum: [5, 6] }
					]
				}
			}
		};
		await testCompletionsFor('{ "c": [ | ] }', schema, {
			items: [
				{ label: '1', resultText: '{ "c": [ 1 ] }' },
				{ label: '2', resultText: '{ "c": [ 2 ] }' }
			]
		});
		await testCompletionsFor('{ "c": [ 1, | ] }', schema, {
			items: [
				{ label: '3', resultText: '{ "c": [ 1, 3 ] }' },
				{ label: '4', resultText: '{ "c": [ 1, 4 ] }' }
			]
		});
		await testCompletionsFor('{ "c": [ 1, 3, 6| ] }', schema, {
			items: [
				{ label: '5', resultText: '{ "c": [ 1, 3, 5 ] }' },
				{ label: '6', resultText: '{ "c": [ 1, 3, 6 ] }' }
			]
		});
		await testCompletionsFor('{ "c": [ | 1] }', schema, {
			items: [
				{ label: '1', resultText: '{ "c": [ 1, 1] }' },
				{ label: '2', resultText: '{ "c": [ 2, 1] }' }
			]
		});
	});

	test('Complete array value with schema 3 (issue #81459)', async function () {

		let schema: JSONSchema = {
			type: "object",
			properties: {
				"a": {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							foo: {
								type: 'string'
							},
							bar: {
								type: 'string'
							}
						}
					}
				}
			}

		};
		await testCompletionsFor('{ "a" : [ { "foo": "a", | } ] }', schema, {
			items: [
				{ label: 'bar', resultText: '{ "a" : [ { "foo": "a", "bar": "$1" } ] }' }
			]
		});
		await testCompletionsFor('{ "a" : [ { "bar": "a" }|, { } ] }', schema, {
			items: [
				{ label: 'foo', notAvailable: true }
			]
		});
	});


	test('Complete value with schema: booleans, null', async function () {

		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'a': {
					type: 'boolean'
				},
				'b': {
					type: ['boolean', 'null']
				},
			}
		};
		await testCompletionsFor('{ "a": | }', schema, {
			count: 2,
			items: [
				{ label: 'true', resultText: '{ "a": true }' },
				{ label: 'false', resultText: '{ "a": false }' },
			]
		});
		await testCompletionsFor('{ "b": "| }', schema, {
			count: 3,
			items: [
				{ label: 'true', resultText: '{ "b": true' },
				{ label: 'false', resultText: '{ "b": false' },
				{ label: 'null', resultText: '{ "b": null' }
			]
		});
	});

	test('Complete with nested schema', async function () {

		let content = '{|}';
		let schema: JSONSchema = {
			oneOf: [{
				type: 'object',
				properties: {
					'a': {
						type: 'number',
						description: 'A'
					},
					'b': {
						type: 'string',
						description: 'B'
					},
				}
			}, {
				type: 'array'
			}]
		};
		await testCompletionsFor(content, schema, {
			count: 2,
			items: [
				{ label: 'a', documentation: 'A' },
				{ label: 'b', documentation: 'B' }
			]
		});
	});

	test('Complete with required anyOf', async function () {

		let schema: JSONSchema = {
			anyOf: [{
				type: 'object',
				required: ['a', 'b'],
				properties: {
					'a': {
						type: 'string',
						description: 'A'
					},
					'b': {
						type: 'string',
						description: 'B'
					},
				}
			}, {
				type: 'object',
				required: ['c', 'd'],
				properties: {
					'c': {
						type: 'string',
						description: 'C'
					},
					'd': {
						type: 'string',
						description: 'D'
					},
				}
			}]
		};
		await testCompletionsFor('{|}', schema, {
			count: 4,
			items: [
				{ label: 'a', documentation: 'A' },
				{ label: 'b', documentation: 'B' },
				{ label: 'c', documentation: 'C' },
				{ label: 'd', documentation: 'D' }
			]
		});
		await testCompletionsFor('{ "a": "", |}', schema, {
			count: 1,
			items: [
				{ label: 'b', documentation: 'B' }
			]
		});
	});

	test('Complete with anyOf', async function () {

		let schema: JSONSchema = {
			anyOf: [{
				type: 'object',
				properties: {
					'type': {
						enum: ['house']
					},
					'b': {
						type: 'string'
					},
				}
			}, {
				type: 'object',
				properties: {
					'type': {
						enum: ['appartment']
					},
					'c': {
						type: 'string'
					},
				}
			}]
		};
		await testCompletionsFor('{|}', schema, {
			count: 3,
			items: [
				{ label: 'type' },
				{ label: 'b' },
				{ label: 'c' }
			]
		});
		await testCompletionsFor('{ "type": "appartment", |}', schema, {
			count: 1,
			items: [
				{ label: 'c' }
			]
		});
	});

	test('Complete with oneOf', async function () {

		let schema: JSONSchema = {
			oneOf: [{
				type: 'object',
				allOf: [{
					properties: {
						'a': {
							type: 'string',
							description: 'A'
						}
					}
				},
				{
					anyOf: [{
						properties: {
							'b1': {
								type: 'string',
								description: 'B1'
							}
						},
					}, {
						properties: {
							'b2': {
								type: 'string',
								description: 'B2'
							}
						},
					}]
				}]
			}, {
				type: 'object',
				properties: {
					'c': {
						type: 'string',
						description: 'C'
					},
					'd': {
						type: 'string',
						description: 'D'
					},
				}
			}]
		};
		await testCompletionsFor('{|}', schema, {
			count: 5,
			items: [
				{ label: 'a', documentation: 'A' },
				{ label: 'b1', documentation: 'B1' },
				{ label: 'b2', documentation: 'B2' },
				{ label: 'c', documentation: 'C' },
				{ label: 'd', documentation: 'D' }
			]
		});
		await testCompletionsFor('{ "b1": "", |}', schema, {
			count: 2,
			items: [
				{ label: 'a', documentation: 'A' },
				{ label: 'b2', documentation: 'B2' }
			]
		});
	});

	test('Complete with oneOf and enums', async function () {

		let schema: JSONSchema = {
			oneOf: [{
				type: 'object',
				properties: {
					'type': {
						type: 'string',
						enum: ['1', '2']
					},
					'a': {
						type: 'object',
						properties: {
							'x': {
								type: 'string'
							},
							'y': {
								type: 'string'
							}
						},
						"required": ['x', 'y']
					},
					'b': {}
				},
			}, {
				type: 'object',
				properties: {
					'type': {
						type: 'string',
						enum: ['3']
					},
					'a': {
						type: 'object',
						properties: {
							'x': {
								type: 'string'
							},
							'z': {
								type: 'string'
							}
						},
						"required": ['x', 'z']
					},
					'c': {}
				},
			}]
		};
		await testCompletionsFor('{|}', schema, {
			count: 4,
			items: [
				{ label: 'type' },
				{ label: 'a' },
				{ label: 'b' },
				{ label: 'c' }
			]
		});
		await testCompletionsFor('{ "type": |}', schema, {
			count: 3,
			items: [
				{ label: '"1"' },
				{ label: '"2"' },
				{ label: '"3"' }
			]
		});
		await testCompletionsFor('{ "a": { "x": "", "y": "" }, "type": |}', schema, {
			count: 2,
			items: [
				{ label: '"1"' },
				{ label: '"2"' }
			]
		});
		await testCompletionsFor('{ "type": "1", "a" : { | }', schema, {
			count: 2,
			items: [
				{ label: 'x' },
				{ label: 'y' }
			]
		});
		await testCompletionsFor('{ "type": "1", "a" : { "x": "", "z":"" }, |', schema, {
			// both alternatives have errors: intellisense proposes all options
			count: 2,
			items: [
				{ label: 'b' },
				{ label: 'c' }
			]
		});
		await testCompletionsFor('{ "a" : { "x": "", "z":"" }, |', schema, {
			count: 2,
			items: [
				{ label: 'type' },
				{ label: 'c' }
			]
		});
	});

	test('Escaping no schema', async function () {
		await testCompletionsFor('[ { "\\\\${1:b}": "John" }, { "|" }', null, {
			items: [
				{ label: '\\${1:b}' }
			]
		});
		await testCompletionsFor('[ { "\\\\${1:b}": "John" }, { | }', null, {
			items: [
				{ label: '\\${1:b}', resultText: '[ { "\\\\${1:b}": "John" }, { "\\\\\\\\\\${1:b\\}" }' }
			]
		});
		await testCompletionsFor('[ { "name": "\\{" }, { "name": | }', null, {
			items: [
				{ label: '"\\{"' }
			]
		});
	});

	test('Escaping with schema', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'{\\}': {
					default: "{\\}",
					defaultSnippets: [{ body: "${1:let}" }],
					enum: ['John{\\}']
				}
			}
		};

		await testCompletionsFor('{ | }', schema, {
			items: [
				{ label: '{\\}', resultText: '{ "{\\\\\\\\\\}": $1 }' }
			]
		});
		await testCompletionsFor('{ "{\\\\}": | }', schema, {
			items: [
				{ label: '"{\\\\}"', resultText: '{ "{\\\\}": "{\\\\\\\\\\}" }' },
				{ label: '"John{\\\\}"', resultText: '{ "{\\\\}": "John{\\\\\\\\\\}" }' },
				{ label: '"let"', resultText: '{ "{\\\\}": "${1:let}" }' }
			]
		});
	});

	test('Escaping with schema - #13716', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'url': {
					default: "http://foo/bar"
				}
			}
		};

		await testCompletionsFor('{ | }', schema, {
			items: [
				{ label: 'url', resultText: '{ "url": "${1:http://foo/bar}" }' }
			]
		});
	});

	test('Sanititize', async function () {
		const longLabel = repeat('abcd', 20);

		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'a\nb': {
					default: 1
				},
				[longLabel]: {
					default: 2
				}
			}
		};

		await testCompletionsFor('{ | }', schema, {
			items: [
				{ label: 'a↵b', resultText: '{ "a\\\\nb": ${1:1} }' },
				{ label: 'abcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcda...', resultText: `{ "${longLabel}": \${1:2} }` }
			]
		});
	});

	test('Enum and defaults', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				prop: {
					type: ['boolean', 'string'],
					enum: [false, 'rcodetools'],
					default: ''
				}
			}
		};

		await testCompletionsFor('{ "prop": | }', schema, {
			items: [
				{ label: 'false', resultText: '{ "prop": false }' },
				{ label: '"rcodetools"', resultText: '{ "prop": "rcodetools" }' },
				{ label: '""', resultText: '{ "prop": "" }' }
			],
			count: 3
		});

	});

	test('examples', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				prop: {
					type: ['string'],
					examples: ['a', 'b'],
					default: 'c'
				}
			}
		};

		await testCompletionsFor('{ "prop": | }', schema, {
			items: [
				{ label: '"a"', resultText: '{ "prop": "a" }' },
				{ label: '"b"', resultText: '{ "prop": "b" }' },
				{ label: '"c"', resultText: '{ "prop": "c" }' }
			],
			count: 3
		});

	});

	test('Const', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				prop: {
					type: 'string',
					const: 'hello'
				},
				propBool: {
					type: 'boolean',
					const: false
				}
			}
		};

		await testCompletionsFor('{ "prop": | }', schema, {
			items: [
				{ label: '"hello"', resultText: '{ "prop": "hello" }' },
			]
		});

		await testCompletionsFor('{ "propBool": | }', schema, {
			items: [
				{ label: 'false', resultText: '{ "propBool": false }' }
			],
			count: 1
		});

	});

	test('$schema', async function () {
		let schema: JSONSchema = {
			type: 'object',
		};
		await testCompletionsFor('{ "$sc| }', null, {
			items: [
				{ label: '$schema', resultText: '{ "\\$schema": $1' }
			]
		});
		await testCompletionsFor('{ "$schema": | }', schema, {
			items: [
				{ label: '"http://myschemastore/test1"', resultText: '{ "$schema": "http://myschemastore/test1" }' }
			]
		});
		await testCompletionsFor('{ "$schema": "|', schema, {
			items: [
				{ label: '"http://myschemastore/test1"', resultText: '{ "$schema": "http://myschemastore/test1"' }
			]
		});
		await testCompletionsFor('{ "$schema": "h|', schema, {
			items: [
				{ label: '"http://myschemastore/test1"', resultText: '{ "$schema": "http://myschemastore/test1"' }
			]
		});
		await testCompletionsFor('{ "$schema": "http://myschemastore/test1"| }', schema, {
			items: [
				{ label: '"http://myschemastore/test1"', resultText: '{ "$schema": "http://myschemastore/test1" }' }
			]
		});
	});

	test('root default proposals', async function () {
		let schema1: JSONSchema = {
			type: 'object',
			default: {
				hello: 'world'
			}
		};
		let schema2: JSONSchema = {
			anyOf: [
				{
					default: {}
				},
				{
					defaultSnippets: [{ label: 'def1', description: 'def1Desc', body: { hello: '${1:world}' } },
					{ body: { "${1:hello}": ["${2:world}"] } }]
				}
			],
			type: 'object',
			default: {
				hello: 'world'
			}
		};
		await testCompletionsFor('|', schema1, {
			items: [
				{ label: '{"hello":"world"}', resultText: '{\n\t"hello": "world"\n\\}' }
			]
		});
		await testCompletionsFor('|', schema2, {
			items: [
				{ label: '{}', resultText: '{$1}' },
				{ label: 'def1', documentation: 'def1Desc', resultText: '{\n\t"hello": "${1:world}"\n}' },
				{ label: '{"hello":["world"]}', resultText: '{\n\t"${1:hello}": [\n\t\t"${2:world}"\n\t]\n}' }
			]

		});

	});

	test('Default snippet', async function () {
		let schema: JSONSchema = {
			type: 'array',
			items: {
				type: 'object',
				defaultSnippets: [
					{ label: 'foo', bodyText: '{\n\t"foo": "${1:b}"\n}' },
					{ label: 'foo2', body: { key1: '^$1' } }
				]
			}
		};

		await testCompletionsFor('|', schema, {
			items: [
				{ label: 'foo', resultText: '[\n\t{\n\t\t"foo": "${1:b}"\n\t}\n]' },
				{ label: 'foo2', resultText: '[\n\t{\n\t\t"key1": $1\n\t}\n]' }
			]
		});
	});

	test('Deprecation message', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'prop1': {
					deprecationMessage: "Prop is deprecated"
				},
				'prop2': {
					type: 'string'
				},
			}
		};

		await testCompletionsFor('{ |', schema, {
			items: [
				{ label: 'prop2' },
				{ label: 'prop1', notAvailable: true }
			]
		});
	});


	test('Enum description', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'prop1': {
					enum: ['e1', 'e2', 'e3'],
					enumDescriptions: ['E1', 'E2', 'E3'],
				},
				'prop2': {
					description: 'prop2',
					enum: ['e1', 'e2', 'e3'],
				},
			}
		};

		await testCompletionsFor('{ "prop1": |', schema, {
			items: [
				{ label: '"e1"', documentation: 'E1' },
				{ label: '"e2"', documentation: 'E2' }
			]
		});
		await testCompletionsFor('{ "prop2": |', schema, {
			items: [
				{ label: '"e1"', documentation: 'prop2' },
				{ label: '"e2"', documentation: 'prop2' }
			]
		});
	});

	test('Enum markdown description', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'prop1': {
					enum: ['e1', 'e2', 'e3'],
					markdownEnumDescriptions: ['*E1*', '*E2*', '*E3*'],
				},
				'prop2': {
					enum: ['e1', 'e2', 'e3'],
					enumDescriptions: ['E1', 'E2', 'E3'],
					markdownEnumDescriptions: ['*E1*', '*E2*', '*E3*'],
				},
				'prop3': {
					description: 'Hello',
					markdownDescription: '*Hello*',
					enum: ['e1', 'e2', 'e3'],
					markdownEnumDescriptions: ['*E1*', '*E2*', '*E3*'],
				},
				'prop4': {
					markdownDescription: '*prop4*',
					enum: ['e1', 'e2', 'e3'],
				},
				'prop5': {
					description: 'prop5',
					markdownDescription: '*prop5*',
					enum: ['e1', 'e2', 'e3'],
				},
			}
		};

		await testCompletionsFor('{ "prop1": |', schema, {
			items: [
				{ label: '"e1"', documentation: { kind: 'markdown', value: '*E1*' } },
				{ label: '"e2"', documentation: { kind: 'markdown', value: '*E2*' } }
			]
		});
		await testCompletionsFor('{ "prop2": |', schema, {
			items: [
				{ label: '"e1"', documentation: { kind: 'markdown', value: '*E1*' } },
				{ label: '"e2"', documentation: { kind: 'markdown', value: '*E2*' } }
			]
		});
		await testCompletionsFor('{ "prop3": |', schema, {
			items: [
				{ label: '"e1"', documentation: { kind: 'markdown', value: '*E1*' } },
				{ label: '"e2"', documentation: { kind: 'markdown', value: '*E2*' } }
			]
		});
		await testCompletionsFor('{ "prop4": |', schema, {
			items: [
				{ label: '"e1"', documentation: { kind: 'markdown', value: '*prop4*' } },
				{ label: '"e2"', documentation: { kind: 'markdown', value: '*prop4*' } }
			]
		});
		await testCompletionsFor('{ "prop5": |', schema, {
			items: [
				{ label: '"e1"', documentation: { kind: 'markdown', value: '*prop5*' } },
				{ label: '"e2"', documentation: { kind: 'markdown', value: '*prop5*' } }
			]
		});

		// without markdown capability
		await testCompletionsFor('{ "prop1": |', schema, {
			items: [
				{ label: '"e1"', documentation: void 0 },
			]
		}, {});
		await testCompletionsFor('{ "prop2": |', schema, {
			items: [
				{ label: '"e1"', documentation: 'E1' },
			]
		}, {});
	});

	test('In comment', async function () {
		await testCompletionsFor('[{ "name": "John", "age": 44 }, { /* | */ }', null, {
			count: 0
		});
		await testCompletionsFor('[{ "name": "John", "age": 44 }, {\n // |', null, {
			count: 0
		});
	});

	test('DoNotSuggest', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'prop1': {
					doNotSuggest: true
				},
				'prop2': {
					doNotSuggest: false
				},
				'prop3': {
					doNotSuggest: false
				},
			}
		};

		await testCompletionsFor('{ |', schema, {
			items: [
				{ label: 'prop2' },
				{ label: 'prop3' }
			]
		});
	});

	test('Primary property', async function () {
		let schema: JSONSchema = {
			type: 'object',
			oneOf: [{

				properties: {
					type: {
						enum: ['foo'],
					},
					prop1: {
						enum: ['e1', 'e2']
					}
				}

			}, {
				type: 'object',
				properties: {
					type: {
						enum: ['bar'],
					},
					prop1: {
						enum: ['f1', 'f2']
					}
				}
			}]
		};

		await testCompletionsFor('{ "type": |', schema, {
			items: [
				{ label: '"foo"' },
				{ label: '"bar"' }
			]
		});
		await testCompletionsFor('{ "type": "f|', schema, {
			items: [
				{ label: '"foo"' },
				{ label: '"bar"' }
			]
		});
		await testCompletionsFor('{ "type": "foo|"', schema, {
			items: [
				{ label: '"foo"' },
				{ label: '"bar"' }
			]
		});
	});

	test('Property with values', async function () {
		let schema: JSONSchema = {
			type: 'object',
			properties: {
				object: {
					type: 'object'
				},
				string: {
					type: 'string'
				},
				boolean: {
					type: 'boolean'
				},
				array: {
					type: 'array'
				},
				oneEnum: {
					enum: ['foo'],
				},
				multiEnum: {
					enum: ['foo', 'bar'],
				},
				default: {
					default: 'foo',
				},
				defaultSnippet: {
					defaultSnippets: [{ body: 'foo' }]
				},
				defaultSnippets: {
					defaultSnippets: [{ body: 'foo' }, { body: 'bar' }]
				},
				snippetAndEnum: {
					defaultSnippets: [{ body: 'foo' }],
					enum: ['foo', 'bar']
				},
				defaultAndEnum: {
					default: 'foo',
					enum: ['foo', 'bar']
				},
			}
		};

		await testCompletionsFor('{ |', schema, {
			items: [
				{ label: 'object', resultText: '{ "object": {$1}' },
				{ label: 'array', resultText: '{ "array": [$1]' },
				{ label: 'string', resultText: '{ "string": "$1"' },
				{ label: 'boolean', resultText: '{ "boolean": $1' },
				{ label: 'oneEnum', resultText: '{ "oneEnum": "${1:foo}"' },
				{ label: 'multiEnum', resultText: '{ "multiEnum": $1' },
				{ label: 'default', resultText: '{ "default": "${1:foo}"' },
				{ label: 'defaultSnippet', resultText: '{ "defaultSnippet": "foo"' },
				{ label: 'defaultSnippets', resultText: '{ "defaultSnippets": $1' },
				{ label: 'snippetAndEnum', resultText: '{ "snippetAndEnum": $1' },
				{ label: 'defaultAndEnum', resultText: '{ "defaultAndEnum": $1' }
			]
		});
	});

	test("if then and else", async function () {
		await testCompletionsFor("{|}", {
			if: { properties: { a: { type: "string" } } }
		}, { count: 1, items: [{ label: "a", resultText: '{"a": "$1"}' }] });
		await testCompletionsFor("{|}", {
			if: { properties: { a: { type: "string" } }, required: ["a"] }, then: { properties: { b: { type: "string" } } }, properties: { c: { type: "string" } }
		}, { count: 2, items: [{ label: "a", resultText: '{"a": "$1"}' }, { label: "c", resultText: '{"c": "$1"}' }] });
		await testCompletionsFor('{"a":"test",|}', {
			if: { properties: { a: { type: "string" } }, required: ["a"] }, then: { properties: { b: { type: "string" } } }, else: { properties: { c: { type: "string" } } }
		}, { count: 1, items: [{ label: "b", resultText: '{"a":"test","b": "$1"}' }] });
		await testCompletionsFor('{"a":"test",|}', {
			if: { properties: { a: { type: "string" } }, required: ["a"] }, then: { properties: { b: { type: "string" } } }
		}, { count: 1, items: [{ label: "b", resultText: '{"a":"test","b": "$1"}' }] });
	});

	test('Filering same label, issue #1062', async function () {
		let schema: JSONSchema = {
			"type": "array",
			"items": {
				"enum": [
					"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefg1",
					"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefg2",
					"_abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefg1",
					"_abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefg2"
				]
			}
		};

		await testCompletionsFor('[ |', schema, {
			count: 4,
			items: [
				{ label: '"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcd...', resultText: '[ "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefg1"' },
				{ label: '"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefg2"', resultText: '[ "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefg2"' },
				{ label: '"_abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabc...', resultText: '[ "_abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefg1"' },
				{ label: '"_abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefg2"', resultText: '[ "_abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefg2"' }
			]
		});
	});
});
