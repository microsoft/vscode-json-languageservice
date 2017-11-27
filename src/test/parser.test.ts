/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import Parser = require('../parser/jsonParser');
import SchemaService = require('../services/jsonSchemaService');
import JsonSchema = require('../jsonSchema');
import { TextDocument } from 'vscode-languageserver-types';

suite('JSON Parser', () => {

	function isValid(json: string): void {
		let result = toDocument(json);
		assert.equal(result.syntaxErrors.length, 0);
	}

	function isInvalid(json: string, ...expectedErrors: Parser.ErrorCode[]): void {
		let result = toDocument(json);
		if (expectedErrors.length === 0) {
			assert.ok(result.syntaxErrors.length > 0, json);
		} else {
			assert.deepEqual(result.syntaxErrors.map(e => e.code), expectedErrors, json);
		}
		// these should be caught by the parser, not the last-ditch guard
		assert.notEqual(result.syntaxErrors[0].message, 'Invalid JSON', json);
	}

	function toDocument(text: string, config?: Parser.JSONDocumentConfig): Parser.JSONDocument {
		return Parser.parse(TextDocument.create('foo://bar/file.json', 'json', 0, text), config);
	}

	test('Invalid body', function () {
		let result = toDocument('*');
		assert.equal(result.syntaxErrors.length, 1);

		isInvalid('{}[]');
	});

	test('Trailing Whitespace', function () {
		isValid('{}\n\n');
	});

	test('No content', function () {
		isValid('');
		isValid('   ');
		isValid('\n\n');
		isValid('/*hello*/  ');
	});

	test('Objects', function () {
		isValid('{}');
		isValid('{"key": "value"}');
		isValid('{"key1": true, "key2": 3, "key3": [null], "key4": { "nested": {}}}');
		isValid('{"constructor": true }');

		isInvalid('{');
		isInvalid('{3:3}');
		isInvalid('{\'key\': 3}');
		isInvalid('{"key" 3}', Parser.ErrorCode.ColonExpected);
		isInvalid('{"key":3 "key2": 4}', Parser.ErrorCode.CommaExpected);
		isInvalid('{"key":42, }', Parser.ErrorCode.TrailingComma);
		isInvalid('{"key:42', Parser.ErrorCode.UnexpectedEndOfString, Parser.ErrorCode.ColonExpected);
	});

	test('Arrays', function () {
		isValid('[]');
		isValid('[1, 2]');
		isValid('[1, "string", false, {}, [null]]');

		isInvalid('[');
		isInvalid('[,]', Parser.ErrorCode.ValueExpected);
		isInvalid('[1 2]', Parser.ErrorCode.CommaExpected);
		isInvalid('[true false]', Parser.ErrorCode.CommaExpected);
		isInvalid('[1, ]', Parser.ErrorCode.TrailingComma);
		isInvalid('[[]', Parser.ErrorCode.CommaOrCloseBacketExpected);
		isInvalid('["something"');
		isInvalid('[magic]');
	});

	test('Strings', function () {
		isValid('["string"]');
		isValid('["\\"\\\\\\/\\b\\f\\n\\r\\t\\u1234\\u12AB"]');
		isValid('["\\\\"]');

		isInvalid('["');
		isInvalid('["]');
		isInvalid('["\\z"]');
		isInvalid('["\\u"]');
		isInvalid('["\\u123"]');
		isInvalid('["\\u123Z"]');
		isInvalid('[\'string\']');
		isInvalid('"\tabc"', Parser.ErrorCode.InvalidCharacter);
	});

	test('Numbers', function () {
		isValid('[0, -1, 186.1, 0.123, -1.583e+4, 1.583E-4, 5e8]');

		isInvalid('[+1]');
		isInvalid('[01]');
		isInvalid('[1.]');
		isInvalid('[1.1+3]');
		isInvalid('[1.4e]');
		isInvalid('[-A]');
	});

	test('Simple AST', function () {

		let result = toDocument('{}');

		assert.strictEqual(result.syntaxErrors.length, 0);

		let node = result.getNodeFromOffset(1);

		assert.equal(node.type, 'object');
		assert.deepEqual(node.getPath(), []);

		assert.strictEqual(result.getNodeFromOffset(2), null);

		result = toDocument('[null]');
		assert.strictEqual(result.syntaxErrors.length, 0);

		node = result.getNodeFromOffset(2);

		assert.equal(node.type, 'null');
		assert.deepEqual(node.getPath(), [0]);

		result = toDocument('{"a":true}');
		assert.strictEqual(result.syntaxErrors.length, 0);

		node = result.getNodeFromOffset(3);

		assert.equal(node.type, 'string');
		assert.equal((<Parser.StringASTNode>node).isKey, true);
		assert.deepEqual(node.getPath(), ['a']);

		node = result.getNodeFromOffset(4);

		assert.equal(node.type, 'property');

		node = result.getNodeFromOffset(0);

		assert.equal(node.type, 'object');

		node = result.getNodeFromOffset(10);

		assert.equal(node, null);

		node = result.getNodeFromOffset(5);

		assert.equal(node.type, 'boolean');
		assert.deepEqual(node.getPath(), ['a']);

	});

	test('Nested AST', function () {

		let content = '{\n\t"key" : {\n\t"key2": 42\n\t}\n}';
		let result = toDocument(content);

		assert.strictEqual(result.syntaxErrors.length, 0);

		let node = result.getNodeFromOffset(content.indexOf('key2') + 2);
		let location = node.getPath();

		assert.deepEqual(location, ['key', 'key2']);

		node = result.getNodeFromOffset(content.indexOf('42') + 1);
		location = node.getPath();

		assert.deepEqual(location, ['key', 'key2']);
	});

	test('Nested AST in Array', function () {

		let result = toDocument('{"key":[{"key2":42}]}');

		assert.strictEqual(result.syntaxErrors.length, 0);

		let node = result.getNodeFromOffset(17);
		let location = node.getPath();

		assert.deepEqual(location, ['key', 0, 'key2']);

	});

	test('Multiline', function () {

		let content = '{\n\t\n}';
		let result = toDocument(content);

		assert.strictEqual(result.syntaxErrors.length, 0);

		let node = result.getNodeFromOffset(content.indexOf('\t') + 1);

		assert.notEqual(node, null);

		content = '{\n"first":true\n\n}';
		result = toDocument(content);

		node = result.getNodeFromOffset(content.length - 2);
		assert.equal(node.type, 'object');

		node = result.getNodeFromOffset(content.length - 4);
		assert.equal(node.type, 'boolean');
	});

	test('Expand errors to entire tokens', function () {

		let content = '{\n"key":32,\nerror\n}';
		let result = toDocument(content);
		assert.equal(result.syntaxErrors.length, 2);
		assert.equal(result.syntaxErrors[0].location.start, content.indexOf('error'));
		assert.equal(result.syntaxErrors[0].location.end, content.indexOf('error') + 5);
	});

	test('Errors at the end of the file', function () {

		let content = '{\n"key":32\n ';
		let result = toDocument(content);
		assert.equal(result.syntaxErrors.length, 1);
		assert.equal(result.syntaxErrors[0].location.start, 9);
		assert.equal(result.syntaxErrors[0].location.end, 10);
	});

	test('Getting keys out of an object', function () {

		let content = '{\n"key":32,\n\n"key2":45}';
		let result = toDocument(content);
		assert.equal(result.syntaxErrors.length, 0);
		let node = result.getNodeFromOffset(content.indexOf('32,\n') + 4);

		assert.equal(node.type, 'object');
		let keyList = (<Parser.ObjectASTNode>node).getKeyList();
		assert.deepEqual(keyList, ['key', 'key2']);
	});

	test('Missing colon', function () {

		let content = '{\n"key":32,\n"key2"\n"key3": 4 }';
		let result = toDocument(content);
		assert.equal(result.syntaxErrors.length, 1);
		assert.equal(result.syntaxErrors[0].code, Parser.ErrorCode.ColonExpected);

		let root = result.root;
		assert.equal(root.type, 'object');
		assert.equal(root.getChildNodes().length, 3);
		let keyList = (<Parser.ObjectASTNode>root).getKeyList();
		assert.deepEqual(keyList, ['key', 'key2', 'key3']);
	});

	test('Missing comma', function () {

		let content = '{\n"key":32,\n"key2": 1 \n"key3": 4 }';
		let result = toDocument(content);
		assert.equal(result.syntaxErrors.length, 1);
		assert.equal(result.syntaxErrors[0].code, Parser.ErrorCode.CommaExpected);

		let root = result.root;
		assert.equal(root.type, 'object');
		assert.equal(root.getChildNodes().length, 3);
		let keyList = (<Parser.ObjectASTNode>root).getKeyList();
		assert.deepEqual(keyList, ['key', 'key2', 'key3']);
	});

	test('Validate types', function () {

		let str = '{"number": 3.4, "integer": 42, "string": "some string", "boolean":true, "null":null, "object":{}, "array":[1, 2]}';
		let result = toDocument(str);

		assert.strictEqual(result.syntaxErrors.length, 0);

		let semanticErrors = result.validate({
			type: 'object'
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'array'
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"number": {
					type: 'number'
				},
				"integer": {
					type: 'integer'
				},
				"string": {
					type: 'string'
				},
				"boolean": {
					type: 'boolean'
				},
				"null": {
					type: 'null'
				},
				"object": {
					type: 'object'
				},
				"array": {
					type: 'array'
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"number": {
					type: 'array'
				},
				"integer": {
					type: 'string'
				},
				"string": {
					type: 'object'
				},
				"boolean": {
					type: 'null'
				},
				"null": {
					type: 'integer'
				},
				"object": {
					type: 'boolean'
				},
				"array": {
					type: 'number'
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 7);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"number": {
					type: 'integer'
				},
			}
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"integer": {
					type: 'number'
				},
			}
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"array": {
					type: 'array',
					items: {
						type: 'integer'
					}
				},
			}
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"array": {
					type: 'array',
					items: {
						type: 'string'
					}
				},
			}
		});

		assert.strictEqual(semanticErrors.length, 2);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"array": false,
			}
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"array": true,
			}
		});

		assert.strictEqual(semanticErrors.length, 0);
	});

	test('Required properties', function () {

		let result = toDocument('{"integer": 42, "string": "some string", "boolean":true}');
		assert.strictEqual(result.syntaxErrors.length, 0);

		let semanticErrors = result.validate({
			type: 'object',
			required: ['string']
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'object',
			required: ['notpresent']
		});

		assert.strictEqual(semanticErrors.length, 1);
	});

	test('Arrays', function () {

		let result = toDocument('[1, 2, 3]');

		assert.strictEqual(result.syntaxErrors.length, 0);

		let semanticErrors = result.validate({
			type: 'array',
			items: {
				type: 'number'
			},
			minItems: 1,
			maxItems: 5
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'array',
			items: {
				type: 'number'
			},
			minItems: 10
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = result.validate({
			type: 'array',
			items: {
				type: 'number'
			},
			maxItems: 2
		});

		assert.strictEqual(semanticErrors.length, 1);

	});

	test('Strings', function () {

		let result = toDocument('{"one":"test"}');
		assert.strictEqual(result.syntaxErrors.length, 0);

		let semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					minLength: 1,
					maxLength: 10
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					minLength: 10,
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					maxLength: 3,
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					pattern: '^test$'
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					pattern: 'fail'
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 1);

		let schemaWithURI = {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					format: 'uri'
				}
			}
		};

		semanticErrors = result.validate(schemaWithURI);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'String is not an URI: URI with a scheme is expected.');

		result = toDocument('{"one":"http://foo/bar"}');
		semanticErrors = result.validate(schemaWithURI);
		assert.strictEqual(semanticErrors.length, 0);

		result = toDocument('{"one":""}');
		semanticErrors = result.validate(schemaWithURI);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'String is not an URI: URI expected.');

		result = toDocument('{"one":"//foo/bar"}');
		semanticErrors = result.validate(schemaWithURI);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'String is not an URI: URI with a scheme is expected.');

		let schemaWithURIReference = {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					format: 'uri-reference'
				}
			}
		};

		result = toDocument('{"one":""}');
		semanticErrors = result.validate(schemaWithURIReference);
		assert.strictEqual(semanticErrors.length, 1, 'uri-reference');
		assert.strictEqual(semanticErrors[0].message, 'String is not an URI: URI expected.');

		result = toDocument('{"one":"//foo/bar"}');
		semanticErrors = result.validate(schemaWithURIReference);
		assert.strictEqual(semanticErrors.length, 0, 'uri-reference');

		let schemaWithEMail = {
			type: 'object',
			properties: {
				"mail": {
					type: 'string',
					format: 'email'
				}
			}
		};

		result = toDocument('{"mail":"foo@bar.com"}');
		semanticErrors = result.validate(schemaWithEMail);
		assert.strictEqual(semanticErrors.length, 0, "email");

		result = toDocument('{"mail":"foo"}');
		semanticErrors = result.validate(schemaWithEMail);
		assert.strictEqual(semanticErrors.length, 1, "email");
		assert.strictEqual(semanticErrors[0].message, 'String is not an e-mail address.');

		let schemaWithColor = {
			type: 'object',
			properties: {
				"color": {
					type: 'string',
					format: 'color-hex'
				}
			}
		};

		result = toDocument('{"color":"#FF00FF"}');
		semanticErrors = result.validate(schemaWithColor);
		assert.strictEqual(semanticErrors.length, 0, "email");

		result = toDocument('{"color":"#FF00F"}');
		semanticErrors = result.validate(schemaWithColor);
		assert.strictEqual(semanticErrors.length, 1, "email");
		assert.strictEqual(semanticErrors[0].message, 'Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.');

	});

	test('Numbers', function () {

		let result = toDocument('{"one": 13.45e+1}');

		assert.strictEqual(result.syntaxErrors.length, 0);

		let semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					minimum: 1,
					maximum: 135
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					minimum: 200,
				}
			}
		});
		assert.strictEqual(semanticErrors.length, 1, 'below minimum');
		assert.strictEqual(semanticErrors[0].message, 'Value is below the minimum of 200.');

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					maximum: 130,
				}
			}
		});
		assert.strictEqual(semanticErrors.length, 1, 'above maximum');
		assert.strictEqual(semanticErrors[0].message, 'Value is above the maximum of 130.');

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					minimum: 134.5,
					exclusiveMinimum: true
				}
			}
		});
		assert.strictEqual(semanticErrors.length, 1, 'at exclusive mininum');
		assert.strictEqual(semanticErrors[0].message, 'Value is below the exclusive minimum of 134.5.');

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					minimum: 134.5,
					exclusiveMinimum: false
				}
			}
		});
		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					exclusiveMinimum: 134.5
				}
			}
		});
		assert.strictEqual(semanticErrors.length, 1, 'at exclusive mininum');
		assert.strictEqual(semanticErrors[0].message, 'Value is below the exclusive minimum of 134.5.');

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					maximum: 134.5,
					exclusiveMaximum: true
				}
			}
		});
		assert.strictEqual(semanticErrors.length, 1, 'at exclusive mininum');
		assert.strictEqual(semanticErrors[0].message, 'Value is above the exclusive maximum of 134.5.');

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					maximum: 134.5,
					exclusiveMaximum: false
				}
			}
		});
		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					exclusiveMaximum: 134.5
				}
			}
		});
		assert.strictEqual(semanticErrors.length, 1, 'at exclusive mininum');
		assert.strictEqual(semanticErrors[0].message, 'Value is above the exclusive maximum of 134.5.');

		semanticErrors = result.validate({
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					minimum: 134.5,
					maximum: 134.5
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 0, 'equal to min and max');
	});

	test('getNodeFromOffset', function () {
		let content = '{"a": 1,\n\n"d": 2}';
		let doc = toDocument(content);

		assert.strictEqual(doc.syntaxErrors.length, 0);

		let node = doc.getNodeFromOffset(content.indexOf(': 2') + 1);

		assert.strictEqual(node.type, 'property');
	});


	test('Duplicate keys', function () {
		let doc = toDocument('{"a": 1, "a": 2}');

		assert.strictEqual(doc.syntaxErrors.length, 2, 'Keys should not be the same');

		doc = toDocument('{"a": { "a": 2, "a": 3}}');

		assert.strictEqual(doc.syntaxErrors.length, 2, 'Keys should not be the same');

		doc = toDocument('[{ "a": 2, "a": 3, "a": 7}]');

		assert.strictEqual(doc.syntaxErrors.length, 3, 'Keys should not be the same');

	});

	test('allOf', function () {

		let doc = toDocument('{"prop1": 42, "prop2": true}');
		assert.strictEqual(doc.syntaxErrors.length, 0);

		let schema: JsonSchema.JSONSchema = {
			id: 'main',
			allOf: [
				{
					type: 'object'
				},
				{
					properties: {
						'prop1': {
							type: 'number'
						}
					}
				},
				{
					properties: {
						'prop2': {
							type: 'boolean'
						}
					}
				}

			]
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop1": 42, "prop2": 123}');
		assert.strictEqual(doc.syntaxErrors.length, 0);

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('anyOf', function () {

		let doc = toDocument('{"prop1": 42, "prop2": true}');
		assert.strictEqual(doc.syntaxErrors.length, 0);

		let schema: JsonSchema.JSONSchema = {
			id: 'main',
			anyOf: [
				{
					properties: {
						'prop1': {
							type: 'number'
						}
					}
				},
				{
					properties: {
						'prop2': {
							type: 'boolean'
						}
					}
				}

			]
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop1": 42, "prop2": 123}');
		assert.strictEqual(doc.syntaxErrors.length, 0);

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop1": "a string", "prop2": 123}');
		assert.strictEqual(doc.syntaxErrors.length, 0);

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('oneOf', function () {

		let doc = toDocument('{"prop1": 42, "prop2": true}');
		assert.strictEqual(doc.syntaxErrors.length, 0);

		let schema: JsonSchema.JSONSchema = {
			id: 'main',
			oneOf: [
				{
					properties: {
						'prop1': {
							type: 'number'
						}
					}
				},
				{
					properties: {
						'prop2': {
							type: 'boolean'
						}
					}
				}

			]
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);

		doc = toDocument('{"prop1": 42, "prop2": 123}');
		assert.strictEqual(doc.syntaxErrors.length, 0);

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop1": "a string", "prop2": 123}');
		assert.strictEqual(doc.syntaxErrors.length, 0);

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});


	test('not', function () {
		let schema: JsonSchema.JSONSchema = {
			id: 'main',
			not: {
				properties: {
					'prop1': {
						type: 'number'
					}
				}
			}

		};

		let doc = toDocument('{"prop1": 42, "prop2": true}');
		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);

		doc = toDocument('{"prop1": "test"}');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);
	});

	test('minProperties', function () {

		let doc = toDocument('{"prop1": 42, "prop2": true}');

		let schema: JsonSchema.JSONSchema = {
			minProperties: 2
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		schema.minProperties = 1;

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		schema.minProperties = 3;

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('maxProperties', function () {

		let doc = toDocument('{"prop1": 42, "prop2": true}');

		let schema: JsonSchema.JSONSchema = {
			maxProperties: 2
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		schema.maxProperties = 3;

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		schema.maxProperties = 1;

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('patternProperties', function () {
		let schema: JsonSchema.JSONSchema = {
			id: 'main',
			patternProperties: {
				'^prop\\d$': {
					type: 'number'
				}
			}
		};

		let doc = toDocument('{"prop1": 42, "prop2": 42}');
		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop1": 42, "prop2": true}');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);

		doc = toDocument('{"prop1": 42, "prop2": 123, "aprop3": true}');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		schema = {
			id: 'main',
			patternProperties: {
				'^prop\\d$': true,
				'^invalid$': false
			}
		};
		doc = toDocument('{"prop1": 42 }');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);
		doc = toDocument('{"invalid": 42 }');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('additionalProperties', function () {

		let doc = toDocument('{"prop1": 42, "prop2": 42}');

		let schema: JsonSchema.JSONSchema = {
			additionalProperties: {
				type: 'number'
			}
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop1": 42, "prop2": true}');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);

		schema = {
			properties: {
				"prop1": {
					type: 'boolean'
				}
			},
			additionalProperties: {
				type: 'number'
			}
		};

		doc = toDocument('{"prop1": true, "prop2": 42}');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		schema = {
			properties: {
				"prop1": {
					type: 'boolean'
				}
			},
			additionalProperties: false
		};

		doc = toDocument('{"prop1": true, "prop2": 42}');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);

		doc = toDocument('{"prop1": true}');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);
	});

	test('enum', function () {

		let doc = toDocument('{"prop": "harmonica"}');

		let schema: JsonSchema.JSONSchema = {
			properties: {
				'prop': {
					enum: ['violin', 'harmonica', 'banjo']
				}
			}
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop": "harp"}');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);

		schema = {
			properties: {
				'prop': {
					enum: [1, 42, 999]
				}
			}
		};

		doc = toDocument('{"prop": 42}');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop": 1337}');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);

		doc = toDocument('{"prop": { "name": "David" }}');

		schema = {
			properties: {
				'prop': {
					enum: ['violin', { "name": "David" }, null]
				}
			}
		};

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);
	});

	test('const', function () {
		let schema: JsonSchema.JSONSchema = {
			properties: {
				'prop': {
					const: 'violin'
				}
			}
		};

		let doc = toDocument('{"prop": "violin"}');
		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop": "harmonica"}');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].code, Parser.ErrorCode.EnumValueMismatch);

		schema = {
			properties: {
				'prop': {
					const: { foo: 2 }
				}
			}
		};
		doc = toDocument('{"prop": { "foo": 2 }');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);
	});

	test('propertyNames', function () {
		let schema: JsonSchema.JSONSchema = {
			propertyNames: {
				type: 'string',
				minLength: 2,
				maxLength: 6
			}
		};

		let doc = toDocument('{"violin": true}');
		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"harmonica": false, "violin": true}');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, "String is longer than the maximum length of 6.");
	});

	test('uniqueItems', function () {

		let doc = toDocument('[1, 2, 3]');

		let schema: JsonSchema.JSONSchema = {
			type: 'array',
			uniqueItems: true
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('[1, 2, 3, 2]');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);

		doc = toDocument('[1, 2, "string", 52, "string"]');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('containsItem', function () {

		let schema: JsonSchema.JSONSchema = {
			type: 'array',
			contains: { type: "number", const: 3 }
		};

		let doc = toDocument('[1, 2, 3]');
		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('[1, 2, 5]');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('items as array', function () {

		let doc = toDocument('[1, true, "string"]');

		let schema: JsonSchema.JSONSchema = {
			type: 'array',
			items: [
				{
					type: 'integer'
				},
				{
					type: 'boolean'
				},
				{
					type: 'string'
				}
			]
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('["string", 1, true]');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 3);

		doc = toDocument('[1, true, "string", "another", 42]');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);
	});

	test('additionalItems', function () {
		let schema: JsonSchema.JSONSchema = {
			type: 'array',
			items: [
				{
					type: 'integer'
				},
				{
					type: 'boolean'
				},
				{
					type: 'string'
				}
			],
			additionalItems: false
		};

		let doc = toDocument('[1, true, "string"]');

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('[1, true, "string", 42]');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);

		schema = {
			type: 'array',
			items: [
				{
					type: 'integer'
				},
				{
					type: 'boolean'
				},
				{
					type: 'string'
				}
			],
			additionalItems: {
				type: "boolean"
			}
		};

		doc = toDocument('[1, true, "string"]');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('[1, true, "string", false, true]');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('[1, true, "string", true, "Hello"]');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);

	});

	test('multipleOf', function () {

		let doc = toDocument('[42]');

		let schema: JsonSchema.JSONSchema = {
			type: 'array',
			items: {
				type: 'integer',
				multipleOf: 2
			}
		};

		let semanticErrors = doc.validate(schema);

		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('[43]');
		semanticErrors = doc.validate(schema);

		assert.strictEqual(semanticErrors.length, 1);
	});

	test('dependencies with array', function () {

		let doc = toDocument('{"a":true, "b":42}');

		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				a: {
					type: 'boolean'
				}
			},
			dependencies: {
				a: ['b']
			}
		};

		let semanticErrors = doc.validate(schema);

		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{}');
		semanticErrors = doc.validate(schema);

		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"a":true}');

		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('dependencies with schema', function () {

		let doc = toDocument('{"a":true, "b":42}');

		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				a: {
					type: 'boolean'
				}
			},
			dependencies: {
				a: {
					properties: {
						b: {
							type: 'integer'
						}
					}
				}
			}
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{}');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"a":true}');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"a":true, "b": "string"}');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('type as array', function () {

		let doc = toDocument('{"prop": 42}');

		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'prop': {
					type: ['number', 'string']
				}
			}
		};

		let semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop": "string"}');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 0);

		doc = toDocument('{"prop": true}');
		semanticErrors = doc.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('deprecated', function () {

		let doc = toDocument('{"prop": 42}');

		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'prop': {
					deprecationMessage: "Prop is deprecated"
				}
			}
		};

		let semanticErrors = doc.validate(schema);

		assert.strictEqual(semanticErrors.length, 1);
	});

	test('Strings with spaces', function () {

		let result = toDocument('{"key1":"first string", "key2":["second string"]}');
		assert.strictEqual(result.syntaxErrors.length, 0);

		let node = result.getNodeFromOffset(9);
		assert.strictEqual(node.getValue(), 'first string');

		node = result.getNodeFromOffset(34);
		assert.strictEqual(node.getValue(), 'second string');

	});

	test('Schema information on node', function () {

		let result = toDocument('{"key":42}');
		assert.strictEqual(result.syntaxErrors.length, 0);

		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'key': {
					oneOf: [{
						type: 'number',
						description: 'this is a number'
					}, {
						type: 'string',
						description: 'this is a string'
					}]
				}
			}
		};

		let node = result.getNodeFromOffset(7);
		assert.strictEqual(node.type, 'number');
		assert.strictEqual(node.getValue(), 42);

		let matchingSchemas = result.getMatchingSchemas(schema);
		let schemas = matchingSchemas.filter((s) => s.node === node && !s.inverted).map((s) => s.schema);

		assert.ok(Array.isArray(schemas));
		// 0 is the most specific schema,
		// 1 is the schema that contained the "oneOf" clause,
		assert.strictEqual(schemas.length, 2);
		assert.strictEqual(schemas[0].description, 'this is a number');
	});

	test('parse with comments', function () {

		function parse<T>(v: string): T {
			let result = toDocument(v);
			assert.equal(result.syntaxErrors.length, 0);
			return <T>result.root.getValue();
		}

		let value = parse<{ far: string; }>('// comment\n{\n"far": "boo"\n}');
		assert.equal(value.far, 'boo');

		value = parse<{ far: string; }>('/* comm\nent\nent */\n{\n"far": "boo"\n}');
		assert.equal(value.far, 'boo');

		value = parse<{ far: string; }>('{\n"far": "boo"\n}');
		assert.equal(value.far, 'boo');

	});

	test('parse with comments collected', function () {

		function assertParse(v: string, expectedComments: number): void {
			let result = toDocument(v, { collectComments: true });
			assert.equal(result.comments.length, expectedComments);
		}

		assertParse('// comment\n{\n"far": "boo"\n}', 1);
		assertParse('/* comm\nent\nent */\n{\n"far": "boo"\n}', 1);
		assertParse('{\n"far": "boo"\n}', 0);
	});

	test('validate alternatives', function () {
		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'key': {
					oneOf: [{
						type: 'object',
						properties: {
							type: {
								enum: ['foo']
							},
							prop1: {
								type: 'boolean'
							},
							prop2: {
								type: 'boolean'
							}
						}
					}, {
						type: 'object',
						properties: {
							type: {
								enum: ['bar']
							},
							prop2: {
								type: 'number'
							}
						}
					}]
				}
			}
		};

		let result = toDocument('{"key":{"type":"foo", "prop2":1 }}');
		assert.strictEqual(result.syntaxErrors.length, 0);

		let semanticErrors = result.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'Incorrect type. Expected "boolean".');

		result = toDocument('{"key":{"type":"bar", "prop1":true, "prop2":false }}');
		assert.strictEqual(result.syntaxErrors.length, 0);

		semanticErrors = result.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'Incorrect type. Expected "number".');
	});

	test('validate alternatives 2', function () {
		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'key': {
					oneOf: [{
						type: 'object',
						properties: {
							type: {
								enum: ['foo']
							},
							prop1: {
								enum: ['v1, v2']
							},
							prop2: {
								enum: ['w1', 'w2']
							}
						}
					}, {
						type: 'object',
						properties: {
							type: {
								enum: ['bar']
							},
							prop2: {
								enum: ['x1', 'x2']
							}
						}
					}]
				}
			}
		};

		let result = toDocument('{"key":{"type":"foo", "prop2":"x1" }}');
		assert.strictEqual(result.syntaxErrors.length, 0);

		let semanticErrors = result.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'Value is not accepted. Valid values: "w1", "w2".');

		result = toDocument('{"key":{"type":"bar", "prop1":"v1", "prop2":"w1" }}');
		assert.strictEqual(result.syntaxErrors.length, 0);

		semanticErrors = result.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'Value is not accepted. Valid values: "x1", "x2".');
	});

	test('enum value merge', function () {
		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'key': {
					oneOf: [{
						enum: ["a", "b"]
					}, {
						enum: ["c", "d"]
					}]
				}
			}
		};

		let result = toDocument('{"key":3 }');
		assert.strictEqual(result.syntaxErrors.length, 0);

		let semanticErrors = result.validate(schema);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'Value is not accepted. Valid values: "a", "b", "c", "d".');
	});

});
