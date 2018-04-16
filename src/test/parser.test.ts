/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { getNodePath, getNodeValue, JSONDocumentConfig, parse, JSONDocument } from '../parser/jsonParser';
import * as SchemaService from '../services/jsonSchemaService';
import * as JsonSchema from '../jsonSchema';
import { TextDocument, Diagnostic, Range } from 'vscode-languageserver-types';
import { ErrorCode, ASTNode, ObjectASTNode } from '../jsonLanguageService';

suite('JSON Parser', () => {

	function isValid(json: string): void {
		let { textDoc, jsonDoc } = toDocument(json);
		assert.equal(jsonDoc.syntaxErrors.length, 0);
	}

	function isInvalid(json: string, ...expectedErrors: ErrorCode[]): void {
		let { textDoc, jsonDoc } = toDocument(json);
		if (expectedErrors.length === 0) {
			assert.ok(jsonDoc.syntaxErrors.length > 0, json);
		} else {
			assert.deepEqual(jsonDoc.syntaxErrors.map(e => e.code), expectedErrors, json);
		}
		// these should be caught by the parser, not the last-ditch guard
		assert.notEqual(jsonDoc.syntaxErrors[0].message, 'Invalid JSON', json);
	}

	function toDocument(text: string, config?: JSONDocumentConfig): { textDoc: TextDocument, jsonDoc: JSONDocument } {
		let textDoc = TextDocument.create('foo://bar/file.json', 'json', 0, text);
		let jsonDoc = parse(textDoc, config);
		return { textDoc, jsonDoc };
	}

	function toRange(text: string, offset: number, length) {
		let textDoc = TextDocument.create('foo://bar/file.json', 'json', 0, text);
		return Range.create(textDoc.positionAt(offset), textDoc.positionAt(offset + length));
	}

	function validate(text: string, schema: JsonSchema.JSONSchema) {
		let { textDoc, jsonDoc } = toDocument(text);
		return jsonDoc.validate(textDoc, schema);
	}

	function assertObject(node: ASTNode, expectedProperties: string[]) {
		assert.equal(node.type, 'object');
		assert.equal((<ObjectASTNode>node).properties.length, expectedProperties.length);
		let keyList = (<ObjectASTNode>node).properties.map(p => p.keyNode.value);
		assert.deepEqual(keyList, expectedProperties);
	}

	test('Invalid body', function () {
		let { textDoc, jsonDoc } = toDocument('*');
		assert.equal(jsonDoc.syntaxErrors.length, 1);

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
		isInvalid('{"key" 3}', ErrorCode.ColonExpected);
		isInvalid('{"key":3 "key2": 4}', ErrorCode.CommaExpected);
		isInvalid('{"key":42, }', ErrorCode.TrailingComma);
		isInvalid('{"key:42', ErrorCode.UnexpectedEndOfString, ErrorCode.ColonExpected);
	});

	test('Arrays', function () {
		isValid('[]');
		isValid('[1, 2]');
		isValid('[1, "string", false, {}, [null]]');

		isInvalid('[');
		isInvalid('[,]', ErrorCode.ValueExpected);
		isInvalid('[1 2]', ErrorCode.CommaExpected);
		isInvalid('[true false]', ErrorCode.CommaExpected);
		isInvalid('[1, ]', ErrorCode.TrailingComma);
		isInvalid('[[]', ErrorCode.CommaOrCloseBacketExpected);
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
		isInvalid('"\tabc"', ErrorCode.InvalidCharacter);
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

	test('Comments', function () {
		isValid('/*d*/ { } /*e*/');
		isInvalid('/*d { }');
	});

	test('Simple AST', function () {
		{
			let { textDoc, jsonDoc } = toDocument('{}');

			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let node = jsonDoc.getNodeFromOffset(1);

			assert.equal(node.type, 'object');
			assert.deepEqual(getNodePath(node), []);

			assert.strictEqual(jsonDoc.getNodeFromOffset(2), void 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('[null]');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let node = jsonDoc.getNodeFromOffset(2);

			assert.equal(node.type, 'null');
			assert.deepEqual(getNodePath(node), [0]);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"a":true}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let node = jsonDoc.getNodeFromOffset(3);

			assert.equal(node.type, 'string');
			assert.deepEqual(getNodePath(node), ['a']);

			node = jsonDoc.getNodeFromOffset(4);

			assert.equal(node.type, 'property');

			node = jsonDoc.getNodeFromOffset(0);

			assert.equal(node.type, 'object');

			node = jsonDoc.getNodeFromOffset(10);

			assert.equal(node, void 0);

			node = jsonDoc.getNodeFromOffset(5);

			assert.equal(node.type, 'boolean');
			assert.deepEqual(getNodePath(node), ['a']);
		}
	});

	test('Nested AST', function () {

		let content = '{\n\t"key" : {\n\t"key2": 42\n\t}\n}';
		let { textDoc, jsonDoc } = toDocument(content);

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let node = jsonDoc.getNodeFromOffset(content.indexOf('key2') + 2);
		let location = getNodePath(node);

		assert.deepEqual(location, ['key', 'key2']);

		node = jsonDoc.getNodeFromOffset(content.indexOf('42') + 1);
		location = getNodePath(node);

		assert.deepEqual(location, ['key', 'key2']);
	});

	test('Nested AST in Array', function () {

		let { textDoc, jsonDoc } = toDocument('{"key":[{"key2":42}]}');

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let node = jsonDoc.getNodeFromOffset(17);
		let location = getNodePath(node);

		assert.deepEqual(location, ['key', 0, 'key2']);

	});

	test('Multiline', function () {
		{
			let content = '{\n\t\n}';
			let { textDoc, jsonDoc } = toDocument(content);

			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let node = jsonDoc.getNodeFromOffset(content.indexOf('\t') + 1);

			assert.notEqual(node, null);
		}
		{
			let content = '{\n"first":true\n\n}';
			let { textDoc, jsonDoc } = toDocument(content);

			let node = jsonDoc.getNodeFromOffset(content.length - 2);
			assert.equal(node.type, 'object');

			node = jsonDoc.getNodeFromOffset(content.length - 4);
			assert.equal(node.type, 'boolean');
		}
	});

	test('Expand errors to entire tokens', function () {

		let content = '{\n"key":32,\nerror\n}';
		let { textDoc, jsonDoc } = toDocument(content);
		assert.equal(jsonDoc.syntaxErrors.length, 2);
		assert.deepEqual(jsonDoc.syntaxErrors[0].range, toRange(content, content.indexOf('error'), 5));
	});

	test('Errors at the end of the file', function () {

		let content = '{\n"key":32\n ';
		let { textDoc, jsonDoc } = toDocument(content);
		assert.equal(jsonDoc.syntaxErrors.length, 1);
		assert.deepEqual(jsonDoc.syntaxErrors[0].range, toRange(content, 9, 1));
	});

	test('Getting keys out of an object', function () {

		let content = '{\n"key":32,\n\n"key2":45}';
		let { textDoc, jsonDoc } = toDocument(content);
		assert.equal(jsonDoc.syntaxErrors.length, 0);
		let node = jsonDoc.getNodeFromOffset(content.indexOf('32,\n') + 4);
		assertObject(node, ['key', 'key2']);
	});

	test('Missing colon', function () {

		let content = '{\n"key":32,\n"key2"\n"key3": 4 }';
		let { textDoc, jsonDoc } = toDocument(content);
		assert.equal(jsonDoc.syntaxErrors.length, 1);
		assert.equal(jsonDoc.syntaxErrors[0].code, ErrorCode.ColonExpected);

		let root = jsonDoc.root;
		assertObject(jsonDoc.root, ['key', 'key2', 'key3']);
	});

	test('Missing comma', function () {

		let content = '{\n"key":32,\n"key2": 1 \n"key3": 4 }';
		let { textDoc, jsonDoc } = toDocument(content);
		assert.equal(jsonDoc.syntaxErrors.length, 1);
		assert.equal(jsonDoc.syntaxErrors[0].code, ErrorCode.CommaExpected);
		assertObject(jsonDoc.root, ['key', 'key2', 'key3']);
	});

	test('Validate types', function () {

		let str = '{"number": 3.4, "integer": 42, "string": "some string", "boolean":true, "null":null, "object":{}, "array":[1, 2]}';
		let { textDoc, jsonDoc } = toDocument(str);

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = jsonDoc.validate(textDoc, {
			type: 'object'
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'array'
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'object',
			properties: {
				"number": {
					type: 'integer'
				},
			}
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'object',
			properties: {
				"integer": {
					type: 'number'
				},
			}
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'object',
			properties: {
				"array": false,
			}
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'object',
			properties: {
				"array": true,
			}
		});

		assert.strictEqual(semanticErrors.length, 0);
	});

	test('Required properties', function () {
		let str = '{"integer": 42, "string": "some string", "boolean":true}';
		let { textDoc, jsonDoc } = toDocument(str);
		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = jsonDoc.validate(textDoc, {
			type: 'object',
			required: ['string']
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'object',
			required: ['notpresent']
		});

		assert.strictEqual(semanticErrors.length, 1);
	});

	test('Arrays', function () {

		let str = '[1, 2, 3]';
		let { textDoc, jsonDoc } = toDocument(str);

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = jsonDoc.validate(textDoc, {
			type: 'array',
			items: {
				type: 'number'
			},
			minItems: 1,
			maxItems: 5
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'array',
			items: {
				type: 'number'
			},
			minItems: 10
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'array',
			items: {
				type: 'number'
			},
			maxItems: 2
		});

		assert.strictEqual(semanticErrors.length, 1);

	});

	test('Strings', function () {

		let str = '{"one":"test"}';
		let { textDoc, jsonDoc } = toDocument(str);
		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					minLength: 10,
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					maxLength: 3,
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 1);

		semanticErrors = jsonDoc.validate(textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					pattern: '^test$'
				}
			}
		});

		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, schemaWithURI);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'String is not a URI: URI with a scheme is expected.');

		semanticErrors = validate('{"one":"http://foo/bar"}', schemaWithURI);
		assert.strictEqual(semanticErrors.length, 0);

		semanticErrors = validate('{"one":""}', schemaWithURI);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'String is not a URI: URI expected.');

		semanticErrors = validate('{"one":"//foo/bar"}', schemaWithURI);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'String is not a URI: URI with a scheme is expected.');

		let schemaWithURIReference = {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					format: 'uri-reference'
				}
			}
		};

		semanticErrors = validate('{"one":""}', schemaWithURIReference);
		assert.strictEqual(semanticErrors.length, 1, 'uri-reference');
		assert.strictEqual(semanticErrors[0].message, 'String is not a URI: URI expected.');

		semanticErrors = validate('{"one":"//foo/bar"}', schemaWithURIReference);
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

		semanticErrors = validate('{"mail":"foo@bar.com"}', schemaWithEMail);
		assert.strictEqual(semanticErrors.length, 0, "email");

		semanticErrors = validate('{"mail":"foo"}', schemaWithEMail);
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

		semanticErrors = validate('{"color":"#FF00FF"}', schemaWithColor);
		assert.strictEqual(semanticErrors.length, 0, "email");

		semanticErrors = validate('{"color":"#FF00F"}', schemaWithColor);
		assert.strictEqual(semanticErrors.length, 1, "email");
		assert.strictEqual(semanticErrors[0].message, 'Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.');

	});

	test('Numbers', function () {

		let str = '{"one": 13.45e+1}';
		let { textDoc, jsonDoc } = toDocument(str);

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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

		semanticErrors = jsonDoc.validate(textDoc, {
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
		let { textDoc, jsonDoc } = toDocument(content);

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let node = jsonDoc.getNodeFromOffset(content.indexOf(': 2') + 1);

		assert.strictEqual(node.type, 'property');
	});


	test('Duplicate keys', function () {
		{
			let { textDoc, jsonDoc } = toDocument('{"a": 1, "a": 2}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 2, 'Keys should not be the same');
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"a": { "a": 2, "a": 3}}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 2, 'Keys should not be the same');
		}
		{
			let { textDoc, jsonDoc } = toDocument('[{ "a": 2, "a": 3, "a": 7}]');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 3, 'Keys should not be the same');
		}
	});

	test('allOf', function () {


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
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 123}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
	});

	test('anyOf', function () {


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
		{
			let str = '{"prop1": 42, "prop2": true}';
			let { textDoc, jsonDoc } = toDocument(str);
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 123}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": "a string", "prop2": 123}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
	});

	test('oneOf', function () {



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
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 123}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": "a string", "prop2": 123}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
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
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": "test"}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
	});

	test('minProperties', function () {

		let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');

		let schema: JsonSchema.JSONSchema = {
			minProperties: 2
		};

		let semanticErrors = jsonDoc.validate(textDoc, schema);
		assert.strictEqual(semanticErrors.length, 0);

		schema.minProperties = 1;

		semanticErrors = jsonDoc.validate(textDoc, schema);
		assert.strictEqual(semanticErrors.length, 0);

		schema.minProperties = 3;

		semanticErrors = jsonDoc.validate(textDoc, schema);
		assert.strictEqual(semanticErrors.length, 1);
	});

	test('maxProperties', function () {

		let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');

		let schema: JsonSchema.JSONSchema = {
			maxProperties: 2
		};

		let semanticErrors = jsonDoc.validate(textDoc, schema);
		assert.strictEqual(semanticErrors.length, 0);

		schema.maxProperties = 3;

		semanticErrors = jsonDoc.validate(textDoc, schema);
		assert.strictEqual(semanticErrors.length, 0);

		schema.maxProperties = 1;

		semanticErrors = jsonDoc.validate(textDoc, schema);
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
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 42}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 123, "aprop3": true}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		schema = {
			id: 'main',
			patternProperties: {
				'^prop\\d$': true,
				'^invalid$': false
			}
		};
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42 }');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"invalid": 42 }');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
	});

	test('additionalProperties', function () {



		let schema: JsonSchema.JSONSchema = {
			additionalProperties: {
				type: 'number'
			}
		};
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 42}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
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
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": true, "prop2": 42}');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		schema = {
			properties: {
				"prop1": {
					type: 'boolean'
				}
			},
			additionalProperties: false
		};
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": true, "prop2": 42}');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop1": true}');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
	});

	test('enum', function () {



		let schema: JsonSchema.JSONSchema = {
			properties: {
				'prop': {
					enum: ['violin', 'harmonica', 'banjo']
				}
			}
		};
		{
			let { textDoc, jsonDoc } = toDocument('{"prop": "harmonica"}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop": "harp"}');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
		schema = {
			properties: {
				'prop': {
					enum: [1, 42, 999]
				}
			}
		};
		{
			let { textDoc, jsonDoc } = toDocument('{"prop": 42}');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop": 1337}');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}


		schema = {
			properties: {
				'prop': {
					enum: ['violin', { "name": "David" }, null]
				}
			}
		};
		{
			let { textDoc, jsonDoc } = toDocument('{"prop": { "name": "David" }}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
	});

	test('const', function () {
		let schema: JsonSchema.JSONSchema = {
			properties: {
				'prop': {
					const: 'violin'
				}
			}
		};
		{
			let { textDoc, jsonDoc } = toDocument('{"prop": "violin"}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop": "harmonica"}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
			assert.strictEqual(semanticErrors[0].code, ErrorCode.EnumValueMismatch);
		}
		{
			schema = {
				properties: {
					'prop': {
						const: { foo: 2 }
					}
				}
			};
			let { textDoc, jsonDoc } = toDocument('{"prop": { "foo": 2 }');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
	});

	test('propertyNames', function () {
		let schema: JsonSchema.JSONSchema = {
			propertyNames: {
				type: 'string',
				minLength: 2,
				maxLength: 6
			}
		};
		{
			let { textDoc, jsonDoc } = toDocument('{"violin": true}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"harmonica": false, "violin": true}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
			assert.strictEqual(semanticErrors[0].message, "String is longer than the maximum length of 6.");
		}
	});

	test('uniqueItems', function () {

		let { textDoc, jsonDoc } = toDocument('[1, 2, 3]');

		let schema: JsonSchema.JSONSchema = {
			type: 'array',
			uniqueItems: true
		};
		{
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('[1, 2, 3, 2]');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
		{
			let { textDoc, jsonDoc } = toDocument('[1, 2, "string", 52, "string"]');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
	});

	test('containsItem', function () {

		let schema: JsonSchema.JSONSchema = {
			type: 'array',
			contains: { type: "number", const: 3 }
		};
		{
			let { textDoc, jsonDoc } = toDocument('[1, 2, 3]');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('[1, 2, 5]');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
	});

	test('items as array', function () {



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
		{
			let { textDoc, jsonDoc } = toDocument('[1, true, "string"]');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('["string", 1, true]');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 3);
		}
		{
			let { textDoc, jsonDoc } = toDocument('[1, true, "string", "another", 42]');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
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
		{
			let { textDoc, jsonDoc } = toDocument('[1, true, "string"]');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('[1, true, "string", 42]');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
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
		{
			let { textDoc, jsonDoc } = toDocument('[1, true, "string"]');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('[1, true, "string", false, true]');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('[1, true, "string", true, "Hello"]');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
	});

	test('multipleOf', function () {



		let schema: JsonSchema.JSONSchema = {
			type: 'array',
			items: {
				type: 'integer',
				multipleOf: 2
			}
		};
		{
			let { textDoc, jsonDoc } = toDocument('[42]');
			let semanticErrors = jsonDoc.validate(textDoc, schema);

			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('[43]');
			let semanticErrors = jsonDoc.validate(textDoc, schema);

			assert.strictEqual(semanticErrors.length, 1);
		}
	});

	test('dependencies with array', function () {



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
		{
			let { textDoc, jsonDoc } = toDocument('{"a":true, "b":42}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);

			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);

			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"a":true}');

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
	});

	test('dependencies with schema', function () {



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
		{
			let { textDoc, jsonDoc } = toDocument('{"a":true, "b":42}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"a":true}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"a":true, "b": "string"}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
	});

	test('type as array', function () {
		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'prop': {
					type: ['number', 'string']
				}
			}
		};

		{
			let { textDoc, jsonDoc } = toDocument('{"prop": 42}');



			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop": "string"}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 0);
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"prop": true}');
			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
		}
	});

	test('deprecated', function () {

		let { textDoc, jsonDoc } = toDocument('{"prop": 42}');

		let schema: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				'prop': {
					deprecationMessage: "Prop is deprecated"
				}
			}
		};

		let semanticErrors = jsonDoc.validate(textDoc, schema);

		assert.strictEqual(semanticErrors.length, 1);
	});

	test('Strings with spaces', function () {

		let { textDoc, jsonDoc } = toDocument('{"key1":"first string", "key2":["second string"]}');
		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let node = jsonDoc.getNodeFromOffset(9);
		assert.strictEqual(getNodeValue(node), 'first string');

		node = jsonDoc.getNodeFromOffset(34);
		assert.strictEqual(getNodeValue(node), 'second string');

	});

	test('Schema information on node', function () {

		let { textDoc, jsonDoc } = toDocument('{"key":42}');
		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

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

		let node = jsonDoc.getNodeFromOffset(7);
		assert.strictEqual(node.type, 'number');
		assert.strictEqual(getNodeValue(node), 42);

		let matchingSchemas = jsonDoc.getMatchingSchemas(schema);
		let schemas = matchingSchemas.filter((s) => s.node === node && !s.inverted).map((s) => s.schema);

		assert.ok(Array.isArray(schemas));
		// 0 is the most specific schema,
		// 1 is the schema that contained the "oneOf" clause,
		assert.strictEqual(schemas.length, 2);
		assert.strictEqual(schemas[0].description, 'this is a number');
	});

	test('parse with comments', function () {

		function parse<T>(v: string): T {
			let { textDoc, jsonDoc } = toDocument(v);
			assert.equal(jsonDoc.syntaxErrors.length, 0);
			return <T>getNodeValue(jsonDoc.root);
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
			let { textDoc, jsonDoc } = toDocument(v, { collectComments: true });
			assert.equal(jsonDoc.comments.length, expectedComments);
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
		{
			let { textDoc, jsonDoc } = toDocument('{"key":{"type":"foo", "prop2":1 }}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
			assert.strictEqual(semanticErrors[0].message, 'Incorrect type. Expected "boolean".');
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"key":{"type":"bar", "prop1":true, "prop2":false }}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
			assert.strictEqual(semanticErrors[0].message, 'Incorrect type. Expected "number".');
		}
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
		{
			let { textDoc, jsonDoc } = toDocument('{"key":{"type":"foo", "prop2":"x1" }}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
			assert.strictEqual(semanticErrors[0].message, 'Value is not accepted. Valid values: "w1", "w2".');
		}
		{
			let { textDoc, jsonDoc } = toDocument('{"key":{"type":"bar", "prop1":"v1", "prop2":"w1" }}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let semanticErrors = jsonDoc.validate(textDoc, schema);
			assert.strictEqual(semanticErrors.length, 1);
			assert.strictEqual(semanticErrors[0].message, 'Value is not accepted. Valid values: "x1", "x2".');
		}
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

		let { textDoc, jsonDoc } = toDocument('{"key":3 }');
		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = jsonDoc.validate(textDoc, schema);
		assert.strictEqual(semanticErrors.length, 1);
		assert.strictEqual(semanticErrors[0].message, 'Value is not accepted. Valid values: "a", "b", "c", "d".');
	});

});
