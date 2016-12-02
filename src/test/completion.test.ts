/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import JsonSchema = require('../jsonSchema');
import * as jsonLanguageService from '../jsonLanguageService';

import {CompletionList, CompletionItemKind, TextDocument, Position, TextEdit, SnippetString} from 'vscode-languageserver-types';
import {applyEdits} from './textEditSupport';

interface ItemDescription {
	label: string;
	detail?: string;
	documentation?: string;
	kind?: CompletionItemKind;
	resultText?: string;
}	

let assertCompletion = function (completions: CompletionList, expected: ItemDescription, document: TextDocument, offset: number) {
	let matches = completions.items.filter(completion => {
		return completion.label === expected.label;
	});
	assert.equal(matches.length, 1, expected.label + " should only existing once: Actual: " + completions.items.map(c => c.label).join(', '));
	let match = matches[0];
	if (expected.detail) {
		assert.equal(match.detail, expected.detail);
	}
	if (expected.documentation) {
		assert.equal(match.documentation, expected.documentation);
	}
	if (expected.kind) {
		assert.equal(match.kind, expected.kind);
	}
	if (expected.resultText) {
		let insertText = match.label;
		if (SnippetString.is(match.insertText)) {
			insertText = match.insertText.value;
		} else if (match.insertText) {
			insertText = match.insertText;
		}
		assert.equal(applyEdits(document, [ TextEdit.replace(match.range, insertText) ]), expected.resultText);
	}
};

suite('JSON Completion', () => {

	let testCompletionsFor = function (value: string, schema: JsonSchema.JSONSchema, expected: { count?: number, items?: ItemDescription[] }): PromiseLike<void> {
		let offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		let ls = jsonLanguageService.getLanguageService({});
		if (schema) {
			ls.configure({
				schemas: [{
					uri: 'http://myschemastore/test1',
					schema,
					fileMatch: ["*.json"]
				}]
			})
		}

		let document = TextDocument.create('test://test/test.json', 'json', 0, value);
		let position = Position.create(0, offset);
		let jsonDoc = ls.parseJSONDocument(document);
		return ls.doComplete(document, position, jsonDoc).then(list => {
			if (expected.count) {
				assert.equal(list.items.length, expected.count, value);
			}
			if (expected.items) {
				for (let item of expected.items) {
					assertCompletion(list, item, document, offset);
				}
			}
		});
	};

	test('Complete keys no schema', function(testDone) {
		Promise.all([
			testCompletionsFor('[ { "name": "John", "age": 44 }, { | }', null, {
				count: 2,
				items: [
					{ label: 'name', resultText: '[ { "name": "John", "age": 44 }, { "name" }' },
					{ label: 'age', resultText: '[ { "name": "John", "age": 44 }, { "age" }' }
				]
			}),
			testCompletionsFor('[ { "name": "John", "age": 44 }, { "| }', null, {
				count: 2,
				items: [
					{ label: 'name', resultText: '[ { "name": "John", "age": 44 }, { "name"' },
					{ label: 'age', resultText: '[ { "name": "John", "age": 44 }, { "age"' }
				]
			}),
			testCompletionsFor('[ { "name": "John", "age": 44 }, { "n| }', null, {
				count: 2,
				items: [
					{ label: 'name', resultText: '[ { "name": "John", "age": 44 }, { "name"' },
					{ label: 'age', resultText: '[ { "name": "John", "age": 44 }, { "age"' }
				]
			}),
			testCompletionsFor('[ { "name": "John", "age": 44 }, { "name|" }', null, {
				count: 2,
				items: [
					{ label: 'name', resultText: '[ { "name": "John", "age": 44 }, { "name" }' },
					{ label: 'age', resultText: '[ { "name": "John", "age": 44 }, { "age" }' }
				]
			}),
			testCompletionsFor('[ { "name": "John", "age": 44, "city": "DC" }, { "name|": "Paul", "age": 23 }', null, {
				items: [
					{ label: 'city', resultText: '[ { "name": "John", "age": 44, "city": "DC" }, { "city": "Paul", "age": 23 }' },
				]
			}),
			testCompletionsFor('[ { "name": "John", "address": { "street" : "MH Road", "number" : 5 } }, { "name": "Jack", "address": { "street" : "100 Feet Road", | }', null, {
				count: 1,
				items: [
					{ label: 'number', resultText: '[ { "name": "John", "address": { "street" : "MH Road", "number" : 5 } }, { "name": "Jack", "address": { "street" : "100 Feet Road", "number" }'}
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete values no schema', function(testDone) {
		Promise.all([
			testCompletionsFor('[ { "name": "John", "age": 44 }, { "name": |', null, {
				count: 1,
				items: [
					{ label: '"John"', resultText: '[ { "name": "John", "age": 44 }, { "name": "John"' }
				]
			}),
			testCompletionsFor('[ { "data": { "key": 1, "data": true } }, { "data": |', null, {
				count: 3,
				items: [
					{ label: '{}', resultText: '[ { "data": { "key": 1, "data": true } }, { "data": {\n\t$1\n}' },
					{ label: 'true', resultText: '[ { "data": { "key": 1, "data": true } }, { "data": true' },
					{ label: 'false', resultText: '[ { "data": { "key": 1, "data": true } }, { "data": false' }
				]
			}),
			testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "|" } ]', null, {
				count: 2,
				items: [
					{ label: '"foo"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "foo" } ]'},
					{ label: '"bar"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "bar" } ]'}
				]
			}),
			testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "f|" } ]', null, {
				count: 2,
				items: [
					{ label: '"foo"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "foo" } ]'},
					{ label: '"bar"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "bar" } ]'}
				]
			}),
			testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"|, "o": 1 } ]', null, {
				count: 2,
				items: [
					{ label: '"foo"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "foo", "o": 1 } ]'},
					{ label: '"bar"', resultText: '[ { "data": "foo" }, { "data": "bar" }, { "data": "bar", "o": 1 } ]'}
				]
			}),
			testCompletionsFor('[ { "data": "foo" }, { "data": "bar" }, { "data": "xoo"  | } ]', null, {
				count: 0
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete keys with schema', function(testDone) {
		let schema: JsonSchema.JSONSchema = {
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
				'c': {
					type: 'boolean',
					description: 'C'
				}
			}
		};
		Promise.all([
			testCompletionsFor('{|}', schema, {
				count: 3,
				items: [
					{ label: 'a', documentation: 'A', resultText: '{"a": ${1:0}}' },
					{ label: 'b', documentation: 'B', resultText: '{"b": "$1"}' },
					{ label: 'c', documentation: 'C', resultText: '{"c": ${1:false}}' }
				]
			}),
			testCompletionsFor('{ "|}', schema, {
				count: 3,
				items: [
					{ label: 'a', documentation: 'A', resultText: '{ "a": ${1:0}' },
					{ label: 'b', documentation: 'B', resultText: '{ "b": "$1"' },
					{ label: 'c', documentation: 'C', resultText: '{ "c": ${1:false}' }
				]
			}),
			testCompletionsFor('{ "a|}', schema, {
				count: 3,
				items: [
					{ label: 'a', documentation: 'A', resultText: '{ "a": ${1:0}' }
				]
			}),
			testCompletionsFor('{ a|}', schema, {
				count: 3,
				items: [
					{ label: 'a', documentation: 'A', resultText: '{ "a": ${1:0}}' }
				]
			}),
			testCompletionsFor('{ "a": 1,|}', schema, {
				count: 2,
				items: [
					{ label: 'b', documentation: 'B', resultText: '{ "a": 1,"b": "$1"}'},
					{ label: 'c', documentation: 'C', resultText: '{ "a": 1,"c": ${1:false}}'}
				]
			}),
			testCompletionsFor('{ |, "a": 1}', schema, {
				count: 3,
				items: [
					{ label: 'b', documentation: 'B', resultText: '{ "b": "$1", "a": 1}'},
					{ label: 'c', documentation: 'C', resultText: '{ "c": ${1:false}, "a": 1}'}
				]
			})
		]).then(() => testDone(), (error) => testDone(error));

	});

	test('Complete value with schema', function(testDone) {

		let schema: JsonSchema.JSONSchema = {
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
		Promise.all([
			testCompletionsFor('{ "a": | }', schema, {
				count: 3,
				items: [
					{ label: '"John"', resultText: '{ "a": "John" }' },
					{ label: '"Jeff"', resultText: '{ "a": "Jeff" }' },
					{ label: '"George"', resultText: '{ "a": "George" }' }
				]
			}),

			testCompletionsFor('{ "a": "J| }', schema, {
				count: 3,
				items: [
					{ label: '"John"', resultText: '{ "a": "John"' },
					{ label: '"Jeff"', resultText: '{ "a": "Jeff"' },
				]
			}),
			testCompletionsFor('{ "a": "John"|, "b": 1 }', schema, {
				count: 3,
				items: [
					{ label: '"John"', resultText: '{ "a": "John", "b": 1 }' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete array value with schema', function(testDone) {

		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'c': {
					type: 'array',
					items: {
						type: 'number',
						enum: [ 1, 2 ]
					}
				}
			}
		};
		Promise.all([
			testCompletionsFor('{ "c": [ | ] }', schema, {
				items: [
					{ label: '1', resultText: '{ "c": [ 1 ] }' },
					{ label: '2', resultText: '{ "c": [ 2 ] }' }
				]
			}),
			testCompletionsFor('{ "c": [ 1, | ] }', schema, {
				items: [
					{ label: '1', resultText: '{ "c": [ 1, 1 ] }' },
					{ label: '2', resultText: '{ "c": [ 1, 2 ] }' }
				]
			}),
			testCompletionsFor('{ "c": [ | 1] }', schema, {
				items: [
					{ label: '1', resultText: '{ "c": [ 1, 1] }' },
					{ label: '2', resultText: '{ "c": [ 2, 1] }' }
				]
			}),	
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete value with schema: booleans, null', function(testDone) {

		let schema: JsonSchema.JSONSchema = {
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
		Promise.all([
			testCompletionsFor('{ "a": | }', schema, {
				count: 2,
				items: [
					{ label: 'true', resultText: '{ "a": true }' },
					{ label: 'false', resultText: '{ "a": false }' },
				]
			}),
			testCompletionsFor('{ "b": "| }', schema, {
				count: 3,
				items: [
					{ label: 'true', resultText: '{ "b": true' },
					{ label: 'false', resultText: '{ "b": false' },
					{ label: 'null', resultText: '{ "b": null' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with nested schema', function(testDone) {

		let content = '{|}';
		let schema: JsonSchema.JSONSchema = {
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
		Promise.all([
			testCompletionsFor(content, schema, {
				count: 2,
				items: [
					{ label: 'a', documentation: 'A'},
					{ label: 'b', documentation: 'B'}
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with required anyOf', function(testDone) {

		let schema: JsonSchema.JSONSchema = {
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
		Promise.all([
			testCompletionsFor('{|}', schema, {
				count: 4,
				items: [
					{ label: 'a', documentation: 'A'},
					{ label: 'b', documentation: 'B'},
					{ label: 'c', documentation: 'C'},
					{ label: 'd', documentation: 'D'}
				]
			}),
			testCompletionsFor('{ "a": "", |}', schema, {
				count: 1,
				items: [
					{ label: 'b', documentation: 'B'}
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with anyOf', function(testDone) {

		let schema: JsonSchema.JSONSchema = {
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
		Promise.all([
			testCompletionsFor('{|}', schema, {
				count: 3,
				items: [
					{ label: 'type'},
					{ label: 'b'},
					{ label: 'c'}
				]
			}),
			testCompletionsFor('{ "type": "appartment", |}', schema, {
				count: 1,
				items: [
					{ label: 'c'}
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with oneOf', function(testDone) {

		let schema: JsonSchema.JSONSchema = {
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
		Promise.all([
			testCompletionsFor('{|}', schema, {
				count: 5,
				items: [
					{ label: 'a', documentation: 'A'},
					{ label: 'b1', documentation: 'B1'},
					{ label: 'b2', documentation: 'B2'},
					{ label: 'c', documentation: 'C'},
					{ label: 'd', documentation: 'D'}
				]
			}),
			testCompletionsFor('{ "b1": "", |}', schema, {
			count: 2,
				items: [
					{ label: 'a', documentation: 'A'},
					{ label: 'b2', documentation: 'B2'}
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Complete with oneOf and enums', function(testDone) {

		let schema: JsonSchema.JSONSchema = {
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
		Promise.all([
			testCompletionsFor('{|}', schema, {
				count: 4,
				items: [
					{ label: 'type'},
					{ label: 'a'},
					{ label: 'b'},
					{ label: 'c'}
				]
			}),
			testCompletionsFor('{ "type": |}', schema, {
				count: 3,
				items: [
					{ label: '"1"'},
					{ label: '"2"'},
					{ label: '"3"'}
				]
			}),
			testCompletionsFor('{ "a": { "x": "", "y": "" }, "type": |}', schema, {
				count: 2,
				items: [
					{ label: '"1"'},
					{ label: '"2"'}
				]
			}),
			testCompletionsFor('{ "type": "1", "a" : { | }', schema, {
				count: 2,
				items: [
					{ label: 'x'},
					{ label: 'y'}
				]
			}),
			testCompletionsFor('{ "type": "1", "a" : { "x": "", "z":"" }, |', schema, {
				// both alternatives have errors: intellisense proposes all options
				count: 2,
				items: [
					{ label: 'b'},
					{ label: 'c'}
				]
			}),
			testCompletionsFor('{ "a" : { "x": "", "z":"" }, |', schema, {
				count: 2,
				items: [
					{ label: 'type'},
					{ label: 'c'}
				]
			}),
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Escaping no schema', function(testDone) {
		Promise.all([
			testCompletionsFor('[ { "\\\\${1:b}": "John" }, { "|" }', null, {
				items: [
					{ label: '\\${1:b}' }
				]
			}),
			testCompletionsFor('[ { "\\\\${1:b}": "John" }, { | }', null, {
				items: [
					{ label: '\\${1:b}', resultText: '[ { "\\\\${1:b}": "John" }, { "\\\\\\\\\\${1:b\\}" }' }
				]
			}),
			testCompletionsFor('[ { "name": "\\{" }, { "name": | }', null, {
				items: [
					{ label: '"\\{"' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Escaping with schema', function(testDone) {
		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'{\\}': {
					default: "{\\}",
					defaultSnippets: [ { body: "${1:let}"} ],
					enum: ['John{\\}']
				}
			}
		};

		Promise.all([
			testCompletionsFor('{ | }', schema, {
				items: [
					{ label: '{\\}', resultText: '{ "{\\\\\\\\\\}": "${1:{\\\\\\\\\\}}" }' }
				]
			}),
			testCompletionsFor('{ "{\\\\}": | }', schema, {
				items: [
					{ label: '"{\\\\}"', resultText: '{ "{\\\\}": "{\\\\\\\\\\}" }' },
					{ label: '"John{\\\\}"', resultText: '{ "{\\\\}": "John{\\\\\\\\\\}" }' },
					{ label: '"let"', resultText: '{ "{\\\\}": "${1:let}" }' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('Escaping with schema - #13716', function(testDone) {
		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'url': {
					default: "http://foo/bar"
				}
			}
		};

		Promise.all([
			testCompletionsFor('{ | }', schema, {
				items: [
					{ label: 'url', resultText: '{ "url": "${1:http://foo/bar}" }' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});	

	test('$schema', function(testDone) {
		let schema: JsonSchema.JSONSchema = {
			type: 'object',
		};

		Promise.all([
			testCompletionsFor('{ "$sc| }', null, {
				items: [
					{ label: '$schema', resultText: '{ "\\$schema": $1' }
				]
			}),
			testCompletionsFor('{ "$schema": | }', schema, {
				items: [
					{ label: '"http://myschemastore/test1"', resultText:  '{ "$schema": "http://myschemastore/test1" }' }
				]
			}),
			testCompletionsFor('{ "$schema": "|', schema, {
				items: [
					{ label: '"http://myschemastore/test1"', resultText: '{ "$schema": "http://myschemastore/test1"' }
				]
			}),
			testCompletionsFor('{ "$schema": "h|', schema, {
				items: [
					{ label: '"http://myschemastore/test1"', resultText: '{ "$schema": "http://myschemastore/test1"' }
				]
			}),
			testCompletionsFor('{ "$schema": "http://myschemastore/test1"| }', schema, {
				items: [
					{ label: '"http://myschemastore/test1"', resultText: '{ "$schema": "http://myschemastore/test1" }' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

	test('root default proposals', function(testDone) {
		let schema1: JsonSchema.JSONSchema = {
			type: 'object',
			default: {
				hello: 'world'
			}
		};
		let schema2: JsonSchema.JSONSchema = {
			anyOf: [
				{
					default: {}
				},
				{
					defaultSnippets: [ { label: 'def1', description: 'def1Desc', body: { hello: '${1:world}' }},
									   { body: { "${1:hello}": [ "${2:world}"]} } ]
				}
			],
			type: 'object',
			default: {
				hello: 'world'
			}
		};		
		Promise.all([
			testCompletionsFor('|', schema1,  {
				items: [
					{ label: '{"hello":"world"}', resultText: '{\n\t"hello": "world"\n\\}' }
				]
			}),
			testCompletionsFor('|', schema2, {
				items: [
					{ label: '{}', resultText: '{\n\t$1\n}' },
					{ label: 'def1', documentation: 'def1Desc', resultText: '{\n\t"hello": "${1:world}"\n}' },
					{ label: '{"hello":["world"]}', resultText: '{\n\t"${1:hello}": [\n\t\t"${2:world}"\n\t]\n}' }
				]

			}),
		]).then(() => testDone(), (error) => testDone(error));

	});

	test('Default snippet', function(testDone) {
		let schema: JsonSchema.JSONSchema = {
			type: 'array',
			items: {
				type: 'object',
				defaultSnippets: [ 
					{ label: 'foo', bodyText: '{\n\t"foo": "${1:b}"\n}'}
				]
			}
		};

		Promise.all([
			testCompletionsFor('|', schema, {
				items: [
					{ label: 'foo', resultText: '[\n\t{\n\t\t"foo": "${1:b}"\n\t}\n]' }
				]
			})
		]).then(() => testDone(), (error) => testDone(error));
	});

});

