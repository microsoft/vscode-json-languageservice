/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { getNodePath, getNodeValue, JSONDocument } from '../parser/jsonParser';
import { TextDocument, Range, ErrorCode, ASTNode, ObjectASTNode, getLanguageService, JSONSchema, SchemaDraft } from '../jsonLanguageService';
import { DiagnosticSeverity } from 'vscode-languageserver-types';

suite('JSON Parser', () => {

	function isValid(json: string): void {
		const { jsonDoc } = toDocument(json);
		assert.equal(jsonDoc.syntaxErrors.length, 0);
	}

	function isInvalid(json: string, ...expectedErrors: ErrorCode[]): void {
		const { jsonDoc } = toDocument(json);
		if (expectedErrors.length === 0) {
			assert.ok(jsonDoc.syntaxErrors.length > 0, json);
		} else {
			assert.deepEqual(jsonDoc.syntaxErrors.map(e => e.code), expectedErrors, json);
		}
		// these should be caught by the parser, not the last-ditch guard
		assert.notEqual(jsonDoc.syntaxErrors[0].message, 'Invalid JSON', json);
	}

	function toDocument(text: string): { textDoc: TextDocument, jsonDoc: JSONDocument } {
		const textDoc = TextDocument.create('foo://bar/file.json', 'json', 0, text);

		const ls = getLanguageService({});
		const jsonDoc = ls.parseJSONDocument(textDoc) as JSONDocument;
		return { textDoc, jsonDoc };
	}

	function toRange(text: string, offset: number, length: number) {
		const textDoc = TextDocument.create('foo://bar/file.json', 'json', 0, text);
		return Range.create(textDoc.positionAt(offset), textDoc.positionAt(offset + length));
	}

	function validate(text: string, schema: JSONSchema) {
		const { textDoc, jsonDoc } = toDocument(text);
		return validate2(jsonDoc, textDoc, schema);
	}

	function validate2(jsonDoc: JSONDocument, textDoc: TextDocument, schema: JSONSchema, draft = SchemaDraft.v7) {
		return jsonDoc.validate(textDoc, schema, undefined, draft);
	}

	function assertObject(node: ASTNode, expectedProperties: string[]) {
		assert.equal(node.type, 'object');
		assert.equal((<ObjectASTNode>node).properties.length, expectedProperties.length);
		const keyList = (<ObjectASTNode>node).properties.map(p => p.keyNode.value);
		assert.deepEqual(keyList, expectedProperties);
	}

	test('Invalid body', function () {
		const { jsonDoc } = toDocument('*');
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

		// comments in JSON keys
		isValid('{ "//": "comment1", "//": "comment2" }');
		isInvalid('{ "regularKey": "value1", "regularKey": "value2" }', ErrorCode.DuplicateKey, ErrorCode.DuplicateKey);
	});

	test('Simple AST', function () {
		{
			const { jsonDoc } = toDocument('{}');

			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const node = jsonDoc.getNodeFromOffset(1)!;

			assert.equal(node.type, 'object');
			assert.deepEqual(getNodePath(node), []);

			assert.strictEqual(jsonDoc.getNodeFromOffset(2), undefined);
		}
		{
			const { jsonDoc } = toDocument('[null]');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const node = jsonDoc.getNodeFromOffset(2)!;

			assert.equal(node.type, 'null');
			assert.deepEqual(getNodePath(node), [0]);
		}
		{
			const { jsonDoc } = toDocument('{"a":true}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			let node = jsonDoc.getNodeFromOffset(3);

			assert.equal(node!.type, 'string');
			assert.deepEqual(getNodePath(node!), ['a']);

			node = jsonDoc.getNodeFromOffset(4);

			assert.equal(node!.type, 'property');

			node = jsonDoc.getNodeFromOffset(0);

			assert.equal(node!.type, 'object');

			node = jsonDoc.getNodeFromOffset(10);

			assert.equal(node, undefined);

			node = jsonDoc.getNodeFromOffset(5);

			assert.equal(node!.type, 'boolean');
			assert.deepEqual(getNodePath(node!), ['a']);
		}
	});

	test('Nested AST', function () {

		const content = '{\n\t"key" : {\n\t"key2": 42\n\t}\n}';
		const { jsonDoc } = toDocument(content);

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let node = jsonDoc.getNodeFromOffset(content.indexOf('key2') + 2);
		let location = getNodePath(node!);

		assert.deepEqual(location, ['key', 'key2']);

		node = jsonDoc.getNodeFromOffset(content.indexOf('42') + 1);
		location = getNodePath(node!);

		assert.deepEqual(location, ['key', 'key2']);
	});

	test('Nested AST in Array', function () {

		const { jsonDoc } = toDocument('{"key":[{"key2":42}]}');

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		const node = jsonDoc.getNodeFromOffset(17);
		const location = getNodePath(node!);

		assert.deepEqual(location, ['key', 0, 'key2']);

	});

	test('Multiline', function () {
		{
			const content = '{\n\t\n}';
			const { jsonDoc } = toDocument(content);

			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const node = jsonDoc.getNodeFromOffset(content.indexOf('\t') + 1);

			assert.notEqual(node, null);
		}
		{
			const content = '{\n"first":true\n\n}';
			const { jsonDoc } = toDocument(content);

			let node = jsonDoc.getNodeFromOffset(content.length - 2);
			assert.equal(node!.type, 'object');

			node = jsonDoc.getNodeFromOffset(content.length - 4);
			assert.equal(node!.type, 'boolean');
		}
	});

	test('Expand errors to entire tokens', function () {

		const content = '{\n"key":32,\nerror\n}';
		const { jsonDoc } = toDocument(content);
		assert.equal(jsonDoc.syntaxErrors.length, 2);
		assert.deepEqual(jsonDoc.syntaxErrors[0].range, toRange(content, content.indexOf('error'), 5));
	});

	test('Errors at the end of the file', function () {

		const content = '{\n"key":32\n ';
		const { jsonDoc } = toDocument(content);
		assert.equal(jsonDoc.syntaxErrors.length, 1);
		assert.deepEqual(jsonDoc.syntaxErrors[0].range, toRange(content, 9, 1));
	});

	test('Getting keys out of an object', function () {

		const content = '{\n"key":32,\n\n"key2":45}';
		const { jsonDoc } = toDocument(content);
		assert.equal(jsonDoc.syntaxErrors.length, 0);
		const node = jsonDoc.getNodeFromOffset(content.indexOf('32,\n') + 4);
		assertObject(node!, ['key', 'key2']);
	});

	test('Missing colon', function () {

		const content = '{\n"key":32,\n"key2"\n"key3": 4 }';
		const { jsonDoc } = toDocument(content);
		assert.equal(jsonDoc.syntaxErrors.length, 1);
		assert.equal(jsonDoc.syntaxErrors[0].code, ErrorCode.ColonExpected);

		const root = jsonDoc.root;
		assertObject(root!, ['key', 'key2', 'key3']);
	});

	test('Missing comma', function () {

		const content = '{\n"key":32,\n"key2": 1 \n"key3": 4 }';
		const { jsonDoc } = toDocument(content);
		assert.equal(jsonDoc.syntaxErrors.length, 1);
		assert.equal(jsonDoc.syntaxErrors[0].code, ErrorCode.CommaExpected);
		assertObject(jsonDoc.root!, ['key', 'key2', 'key3']);
	});

	test('Validate types', function () {

		const str = '{"number": 3.4, "integer": 42, "string": "some string", "boolean":true, "null":null, "object":{}, "array":[1, 2]}';
		const { textDoc, jsonDoc } = toDocument(str);

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object'
		});

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'array'
		});

		assert.strictEqual(semanticErrors!.length, 1);

		semanticErrors = validate2(jsonDoc, textDoc, {
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

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
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

		assert.strictEqual(semanticErrors!.length, 7);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"number": {
					type: 'integer'
				},
			}
		});

		assert.strictEqual(semanticErrors!.length, 1);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"integer": {
					type: 'number'
				},
			}
		});

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
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

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
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

		assert.strictEqual(semanticErrors!.length, 2);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"array": false,
			}
		});

		assert.strictEqual(semanticErrors!.length, 1);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"array": true,
			}
		});

		assert.strictEqual(semanticErrors!.length, 0);
	});

	test('Required properties', function () {
		const str = '{"integer": 42, "string": "some string", "boolean":true}';
		const { textDoc, jsonDoc } = toDocument(str);
		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			required: ['string']
		});

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			required: ['notpresent']
		});

		assert.strictEqual(semanticErrors!.length, 1);
	});

	test('Arrays', function () {

		const str = '[1, 2, 3]';
		const { textDoc, jsonDoc } = toDocument(str);

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'array',
			items: {
				type: 'number'
			},
			minItems: 1,
			maxItems: 5
		});

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'array',
			items: {
				type: 'number'
			},
			minItems: 10
		});

		assert.strictEqual(semanticErrors!.length, 1);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'array',
			items: {
				type: 'number'
			},
			maxItems: 2
		});

		assert.strictEqual(semanticErrors!.length, 1);

	});

	test('Strings', function () {

		const str = '{"one":"test"}';
		const { textDoc, jsonDoc } = toDocument(str);
		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					minLength: 1,
					maxLength: 10
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					minLength: 10,
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 1);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					maxLength: 3,
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 1);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					pattern: '^test$'
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					pattern: 'fail'
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 1);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					pattern: '(?i)^TEST$'
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					pattern: '(?i)^Fail$'
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 1);

		// Patterns may include Unicode character classes.
		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					pattern: '^[\\p{Letter}]+$',
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					pattern: '(?i)^[\\p{Letter}]+$',
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					pattern: '(^\\d+(\\-\\d+)?$)|(.+)',
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 0);


		const schemaWithURI = {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					format: 'uri'
				}
			}
		};

		semanticErrors = validate2(jsonDoc, textDoc, schemaWithURI);
		assert.strictEqual(semanticErrors!.length, 1);
		assert.strictEqual(semanticErrors![0].message, 'String is not a URI: URI with a scheme is expected.');

		semanticErrors = validate('{"one":"http://foo/bar"}', schemaWithURI);
		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate('{"one":""}', schemaWithURI);
		assert.strictEqual(semanticErrors!.length, 1);
		assert.strictEqual(semanticErrors![0].message, 'String is not a URI: URI expected.');

		semanticErrors = validate('{"one":"//foo/bar"}', schemaWithURI);
		assert.strictEqual(semanticErrors!.length, 1);
		assert.strictEqual(semanticErrors![0].message, 'String is not a URI: URI with a scheme is expected.');

		const schemaWithURIReference = {
			type: 'object',
			properties: {
				"one": {
					type: 'string',
					format: 'uri-reference'
				}
			}
		};

		semanticErrors = validate('{"one":""}', schemaWithURIReference);
		assert.strictEqual(semanticErrors!.length, 1, 'uri-reference');
		assert.strictEqual(semanticErrors![0].message, 'String is not a URI: URI expected.');

		semanticErrors = validate('{"one":"//foo/bar"}', schemaWithURIReference);
		assert.strictEqual(semanticErrors!.length, 0, 'uri-reference');

		const schemaWithHostname = {
			type: 'object',
			properties: {
				"hostname": {
					type: 'string',
					format: 'hostname'
				}
			}
		};

		semanticErrors = validate('{"hostname":"code.visualstudio.com"}', schemaWithHostname);
		assert.strictEqual(semanticErrors!.length, 0, "hostname");

		semanticErrors = validate('{"hostname":"foo/bar"}', schemaWithHostname);
		assert.strictEqual(semanticErrors!.length, 1, "hostname");
		assert.strictEqual(semanticErrors![0].message, 'String is not a hostname.');

		const schemaWithIPv4 = {
			type: 'object',
			properties: {
				"hostaddr4": {
					type: 'string',
					format: 'ipv4'
				}
			}
		};

		semanticErrors = validate('{"hostaddr4":"127.0.0.1"}', schemaWithIPv4);
		assert.strictEqual(semanticErrors!.length, 0, "hostaddr4");

		semanticErrors = validate('{"hostaddr4":"1916:0:0:0:0:F00:1:81AE"}', schemaWithIPv4);
		assert.strictEqual(semanticErrors!.length, 1, "hostaddr4");
		assert.strictEqual(semanticErrors![0].message, 'String is not an IPv4 address.');

		const schemaWithIPv6 = {
			type: 'object',
			properties: {
				"hostaddr6": {
					type: 'string',
					format: 'ipv6'
				}
			}
		};

		semanticErrors = validate('{"hostaddr6":"1916:0:0:0:0:F00:1:81AE"}', schemaWithIPv6);
		assert.strictEqual(semanticErrors!.length, 0, "hostaddr6");

		semanticErrors = validate('{"hostaddr6":"127.0.0.1"}', schemaWithIPv6);
		assert.strictEqual(semanticErrors!.length, 1, "hostaddr6");
		assert.strictEqual(semanticErrors![0].message, 'String is not an IPv6 address.');

		const schemaWithEMail = {
			type: 'object',
			properties: {
				"mail": {
					type: 'string',
					format: 'email'
				}
			}
		};

		semanticErrors = validate('{"mail":"foo@bar.com"}', schemaWithEMail);
		assert.strictEqual(semanticErrors!.length, 0, "email");

		semanticErrors = validate('{"mail":"foo"}', schemaWithEMail);
		assert.strictEqual(semanticErrors!.length, 1, "email");
		assert.strictEqual(semanticErrors![0].message, 'String is not an e-mail address.');

		const schemaWithColor = {
			type: 'object',
			properties: {
				"color": {
					type: 'string',
					format: 'color-hex'
				}
			}
		};

		semanticErrors = validate('{"color":"#FF00FF"}', schemaWithColor);
		assert.strictEqual(semanticErrors!.length, 0, "email");

		semanticErrors = validate('{"color":"#FF00F"}', schemaWithColor);
		assert.strictEqual(semanticErrors!.length, 1, "email");
		assert.strictEqual(semanticErrors![0].message, 'Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.');


		const schemaWithDateTime = {
			type: 'object',
			properties: {
				"date-time": {
					type: 'string',
					format: 'date-time'
				},
				"date": {
					type: 'string',
					format: 'date'
				},
				"time": {
					type: 'string',
					format: 'time'
				}

			}
		};

		semanticErrors = validate('{"date-time":"1985-04-12T23:20:50.52Z"}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 0, "date-time");

		semanticErrors = validate('{"date-time":"1996-12-19T16:39:57-08:00"}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 0, "date-time");

		semanticErrors = validate('{"date-time":"1990-12-31T23:59:60Z"}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 0, "date-time");

		semanticErrors = validate('{"date-time":"1937-01-01T12:00:27.87+00:20"}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 0, "date-time");

		semanticErrors = validate('{"date-time":"198a-04-12T23:20:50.52Z"}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 1, "date-time");
		assert.strictEqual(semanticErrors![0].message, 'String is not a RFC3339 date-time.');

		semanticErrors = validate('{"date-time":"198a-04-12"}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 1, "date-time");
		assert.strictEqual(semanticErrors![0].message, 'String is not a RFC3339 date-time.');

		semanticErrors = validate('{"date-time":""}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 1, "date-time");
		assert.strictEqual(semanticErrors![0].message, 'String is not a RFC3339 date-time.');

		semanticErrors = validate('{"date":"1937-01-01"}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 0, "date");

		semanticErrors = validate('{"date":"23:20:50.52Z"}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 1, "date");
		assert.strictEqual(semanticErrors![0].message, 'String is not a RFC3339 date.');

		semanticErrors = validate('{"time":"23:20:50.52Z"}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 0, "time");

		semanticErrors = validate('{"time":"198a-04-12T23:20:50.52Z"}', schemaWithDateTime);
		assert.strictEqual(semanticErrors!.length, 1, "time");
		assert.strictEqual(semanticErrors![0].message, 'String is not a RFC3339 time.');
	});

	test('Numbers', function () {

		const str = '{"one": 13.45e+1}';
		const { textDoc, jsonDoc } = toDocument(str);

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					minimum: 1,
					maximum: 135
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					minimum: 200,
				}
			}
		});
		assert.strictEqual(semanticErrors!.length, 1, 'below minimum');
		assert.strictEqual(semanticErrors![0].message, 'Value is below the minimum of 200.');

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					maximum: 130,
				}
			}
		});
		assert.strictEqual(semanticErrors!.length, 1, 'above maximum');
		assert.strictEqual(semanticErrors![0].message, 'Value is above the maximum of 130.');

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					minimum: 134.5,
					exclusiveMinimum: true
				}
			}
		});
		assert.strictEqual(semanticErrors!.length, 1, 'at exclusive mininum');
		assert.strictEqual(semanticErrors![0].message, 'Value is below the exclusive minimum of 134.5.');

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					minimum: 134.5,
					exclusiveMinimum: false
				}
			}
		});
		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					exclusiveMinimum: 134.5
				}
			}
		});
		assert.strictEqual(semanticErrors!.length, 1, 'at exclusive mininum');
		assert.strictEqual(semanticErrors![0].message, 'Value is below the exclusive minimum of 134.5.');

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					maximum: 134.5,
					exclusiveMaximum: true
				}
			}
		});
		assert.strictEqual(semanticErrors!.length, 1, 'at exclusive mininum');
		assert.strictEqual(semanticErrors![0].message, 'Value is above the exclusive maximum of 134.5.');

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					maximum: 134.5,
					exclusiveMaximum: false
				}
			}
		});
		assert.strictEqual(semanticErrors!.length, 0);

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					exclusiveMaximum: 134.5
				}
			}
		});
		assert.strictEqual(semanticErrors!.length, 1, 'at exclusive mininum');
		assert.strictEqual(semanticErrors![0].message, 'Value is above the exclusive maximum of 134.5.');

		semanticErrors = validate2(jsonDoc, textDoc, {
			type: 'object',
			properties: {
				"one": {
					type: 'number',
					minimum: 134.5,
					maximum: 134.5
				}
			}
		});

		assert.strictEqual(semanticErrors!.length, 0, 'equal to min and max');
	});

	test('getNodeFromOffset', function () {
		const content = '{"a": 1,\n\n"d": 2}';
		const { jsonDoc } = toDocument(content);

		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		const node = jsonDoc.getNodeFromOffset(content.indexOf(': 2') + 1);

		assert.strictEqual(node!.type, 'property');
	});


	test('Duplicate keys', function () {
		{
			const { jsonDoc } = toDocument('{"a": 1, "a": 2}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 2, 'Keys should not be the same');
		}
		{
			const { jsonDoc } = toDocument('{"a": { "a": 2, "a": 3}}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 2, 'Keys should not be the same');
		}
		{
			const { jsonDoc } = toDocument('[{ "a": 2, "a": 3, "a": 7}]');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 3, 'Keys should not be the same');
		}
	});

	test('allOf', function () {


		const schema: JSONSchema = {
			id: 'test://schemas/main',
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
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 123}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
	});

	test('anyOf', function () {


		const schema: JSONSchema = {
			id: 'test://schemas/main',
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
			const str = '{"prop1": 42, "prop2": true}';
			const { textDoc, jsonDoc } = toDocument(str);
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 123}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": "a string", "prop2": 123}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
	});

	test('oneOf', function () {



		const schema: JSONSchema = {
			id: 'test://schemas/main',
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
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 123}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": "a string", "prop2": 123}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
	});


	test('not', function () {
		const schema: JSONSchema = {
			id: 'test://schemas/main',
			not: {
				properties: {
					'prop1': {
						type: 'number'
					}
				}
			}

		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": "test"}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
	});


	test('if/then/else', function () {
		const schema: JSONSchema = {
			id: 'test://schemas/main',
			if: {
				properties: {
					foo: {
						const: 'bar'
					}
				}
			},
			then: {
				properties: {
					abc: {
						type: 'boolean'
					}
				}
			},
			else: {
				properties: {
					abc: {
						type: 'string'
					}
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"foo": "bar", "abc": true}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"foo": "bar", "abc": "baz"}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"foo": "test", "abc": true}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"foo": "test", "abc": "baz"}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
	});

	test('nested if/then/else', function () {
		const schema: JSONSchema = {
			id: 'test://schemas/main',
			if: {
				properties: {
					foo: {
						const: 'bar'
					}
				}
			},
			then: {
				properties: {
					abc: {
						type: 'boolean'
					}
				}
			},
			else: {
				if: {
					properties: {
						foo: {
							const: 'baz'
						}
					}
				},
				then: {
					properties: {
						abc: {
							type: 'array'
						}
					}
				},
				else: {
					properties: {
						abc: {
							type: 'string'
						}
					}
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"foo": "bar", "abc": true}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"foo": "bar", "abc": "baz"}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"foo": "baz", "abc": []}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"foo": "baz", "abc": "baz"}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"foo": "test", "abc": true}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"foo": "test", "abc": "baz"}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
	});

	test('minProperties', function () {

		const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');

		const schema: JSONSchema = {
			minProperties: 2
		};

		let semanticErrors = validate2(jsonDoc, textDoc, schema);
		assert.strictEqual(semanticErrors!.length, 0);

		schema.minProperties = 1;

		semanticErrors = validate2(jsonDoc, textDoc, schema);
		assert.strictEqual(semanticErrors!.length, 0);

		schema.minProperties = 3;

		semanticErrors = validate2(jsonDoc, textDoc, schema);
		assert.strictEqual(semanticErrors!.length, 1);
	});

	test('maxProperties', function () {

		const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');

		const schema: JSONSchema = {
			maxProperties: 2
		};

		let semanticErrors = validate2(jsonDoc, textDoc, schema);
		assert.strictEqual(semanticErrors!.length, 0);

		schema.maxProperties = 3;

		semanticErrors = validate2(jsonDoc, textDoc, schema);
		assert.strictEqual(semanticErrors!.length, 0);

		schema.maxProperties = 1;

		semanticErrors = validate2(jsonDoc, textDoc, schema);
		assert.strictEqual(semanticErrors!.length, 1);
	});

	test('patternProperties', function () {
		let schema: JSONSchema = {
			id: 'test://schemas/main',
			patternProperties: {
				'^prop\\d$': {
					type: 'number'
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 42}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 123, "aprop3": true}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		schema = {
			id: 'test://schemas/main',
			patternProperties: {
				'^prop\\d$': true,
				'^invalid$': false
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42 }');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"invalid": 42 }');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		schema = {
			id: 'test://schemas/main',
			patternProperties: {
				'(?i)^foo$': true
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"Foo": 42 }');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}

		// PatternProperties may include Unicode character classes.
		schema = {
			id: 'test://schemas/main',
			patternProperties: {
				'^letter\\p{Letter}$': true,
				'(?i)^number\\p{Number}$': true,
			},
			additionalProperties: false,
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"letterZ": [], "NumBer2": [], "number3": []}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"other": []}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"letter9": [], "NumberZ": []}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 2);
		}
	});

	test('additionalProperties', function () {

		let schema: JSONSchema = {
			additionalProperties: {
				type: 'number'
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": 42}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
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
			const { textDoc, jsonDoc } = toDocument('{"prop1": true, "prop2": 42}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
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
			const { textDoc, jsonDoc } = toDocument('{"prop1": true, "prop2": 42}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": true}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
	});

	test('unevaluatedProperties', function () {

		let schema: JSONSchema = {
			properties: {
				prop1: {
					type: 'number'
				}
			},
			unevaluatedProperties: false
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 42, "prop2": true}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		schema = {
			properties: {
				prop1: {
					type: 'number'
				}
			},
			unevaluatedProperties: {
				type: 'number'
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": true, "prop2": true}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 2);
		}
		schema = {
			allOf: [
				{
					properties: {
						prop1: {
							type: 'number'
						}
					},
				},
				{
					properties: {
						prop2: {
							type: 'number'
						}
					},
				},
			],
			unevaluatedProperties: false
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 23, "prop2": 42}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop3": true}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		schema = {
			anyOf: [
				{
					properties: {
						prop1: {
							type: 'number'
						}
					},
					patternProperties: {
						['^x']: {
							type: 'boolean'
						}
					}
				},
				{
					properties: {
						prop2: {
							type: 'number'
						}
					},
				},
			],
			unevaluatedProperties: false
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 12, "prop2": 23, "x": true, "y": 23}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		schema = {
			oneOf: [
				{
					properties: {
						prop1: {
							type: 'number'
						}
					},
					additionalProperties: {
						type: 'boolean'
					}
				},
				{
					properties: {
						prop2: {
							type: 'number'
						}
					},
					required: ['prop2']
				},
			],
			unevaluatedProperties: false
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 12, "prop3": true }');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		schema = {
			"title": "Vehicle",
			"type": "object",
			"oneOf": [
				{
					"title": "Car",
					"required": ["wheels", "headlights"],
					"properties": {
						"wheels": {},
						"headlights": {}
					}
				},
				{
					"title": "Boat",
					"required": ["pontoons"],
					"properties": {
						"pontoons": {}
					}
				},
				{
					"title": "Plane",
					"required": ["wings"],
					"properties": {
						"wings": {}
					}
				}
			],
			"unevaluatedProperties": false
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"pontoons": 1}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"pontoons": 1, "wheels" 2}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		schema = {
			if: {
				properties: {
					prop1: {
						type: 'number'
					}
				},
			},
			then: {
				required: ['prop2'],
				properties: {
					prop2: {
						type: 'boolean'
					}
				},
			},
			else: {
				required: ['prop3'],
				properties: {
					prop3: {
						type: 'boolean'
					}
				},
			},
			unevaluatedProperties: false
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop1": 12, "prop2": true }');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
	});

	test('enum', function () {
		let schema: JSONSchema = {
			properties: {
				'prop': {
					enum: ['violin', 'harmonica', 'banjo']
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": "harmonica"}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": "harp"}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		schema = {
			properties: {
				'prop': {
					enum: [1, 42, 999]
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": 42}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": 1337}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}


		schema = {
			properties: {
				'prop': {
					enum: ['violin', { "name": "David" }, null]
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": { "name": "David" }}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
	});

	test('const', function () {
		const schema: JSONSchema = {
			properties: {
				'prop': {
					const: 'violin'
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": "violin"}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": "harmonica"}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
			assert.strictEqual(semanticErrors![0].code, ErrorCode.EnumValueMismatch);
		}
		{
			const schema = {
				properties: {
					'prop': {
						const: { foo: 2 }
					}
				}
			};
			const { textDoc, jsonDoc } = toDocument('{"prop": { "foo": 2 }');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
	});

	test('oneOf const', function () {
		const schema: JSONSchema = {
			properties: {
				'prop': {
					oneOf: [
						{
							"const": 0,
							"title": "Value of 0"
						},
						{
							"const": 1,
							"title": "Value of 1"
						},
						{
							"const": 2,
							"title": "Value of 2"
						}
					]
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": 0}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": 4}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
			assert.strictEqual(semanticErrors![0].code, ErrorCode.EnumValueMismatch);
		}
	});

	test('propertyNames', function () {
		const schema: JSONSchema = {
			propertyNames: {
				type: 'string',
				minLength: 2,
				maxLength: 6
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"violin": true}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"harmonica": false, "violin": true}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
			assert.strictEqual(semanticErrors![0].message, "String is longer than the maximum length of 6.");
		}
	});

	test('uniqueItems', function () {

		const { textDoc, jsonDoc } = toDocument('[1, 2, 3]');

		const schema: JSONSchema = {
			type: 'array',
			uniqueItems: true
		};
		{
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, 2, 3, 2]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, 2, "string", 52, "string"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
	});

	test('containsItem', function () {

		const schema: JSONSchema = {
			type: 'array',
			contains: { type: "number", const: 3 }
		};
		{
			const { textDoc, jsonDoc } = toDocument('[1, 2, 3]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, 2, 5]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
	});

	test('minContains / maxContains', function () {

		let schema: JSONSchema = {
			type: 'array',
			contains: { type: "string" },
			"minContains": 1,
			"maxContains": 3
		};
		{
			const { textDoc, jsonDoc } = toDocument('["1", 2, 3]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, 2, 3]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('["1", "2", "3", 4]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('["1", "2", "3", "4"]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		schema = {
			type: 'array',
			contains: { type: "string" },
			"minContains": 0,
			"maxContains": 1
		};
		{
			const { textDoc, jsonDoc } = toDocument('[ 1 ]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[ 1, "1" ]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[ 1, "1", "2" ]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
	});

	test('items as array / prefixItems', function () {
		let schema: JSONSchema = {
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
			const { textDoc, jsonDoc } = toDocument('[1, true, "string"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('["string", 1, true]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 3);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, true, "string", "another", 42]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		schema = {
			type: 'array',
			prefixItems: [
				{
					type: 'integer'
				},
				{
					type: 'boolean'
				}
			],
			items: {
				type: 'string'
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('[1, true, "string", "another"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2020_12);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, true, "string", "another", 1]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2020_12);
			assert.strictEqual(semanticErrors!.length, 1);
		}
	});

	test('additionalItems', function () {
		let schema: JSONSchema = {
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
			const { textDoc, jsonDoc } = toDocument('[1, true, "string"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, true, "string", 42]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
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
			const { textDoc, jsonDoc } = toDocument('[1, true, "string"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, true, "string", false, true]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, true, "string", true, "Hello"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
	});


	test('unevaluatedItems', function () {
		let schema: JSONSchema = {
			type: 'array',
			items: [
				{
					type: 'integer'
				},
				{
					type: 'boolean'
				}
			],
			unevaluatedItems: false
		};
		{
			const { textDoc, jsonDoc } = toDocument('[1, true]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2019_09);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, true, "string", 42]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2019_09);
			assert.strictEqual(semanticErrors!.length, 2);
		}
		schema = {
			anyOf: [
				{
					type: 'array',
					items: [
						{
							type: 'integer'
						},
						{
							type: 'integer'
						}
					],
				},
				{
					type: 'array',
					items: [
						{
							type: 'integer'
						},
						{
							type: 'boolean'
						},
						{
							type: 'boolean'
						}
					],
				},
			],
			unevaluatedItems: false
		};
		{
			const { textDoc, jsonDoc } = toDocument('[1, 1]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2019_09);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, true, true]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2019_09);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[1, true, true, true, "Hello"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2019_09);
			assert.strictEqual(semanticErrors!.length, 2);
		}
		schema = {
			"type": "array",
			"prefixItems": [{ "type": "string" }, { "type": "string" }],
			"contains": { "type": "string", "minLength": 3 },
			"unevaluatedItems": false
		};
		{
			const { textDoc, jsonDoc } = toDocument('["Hello", "Hello", "1"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2020_12);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('["Hello", "Hello", "Hello"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2020_12);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('["Hello", "Hello", "1", "Hello"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2020_12);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		schema = {
			"type": "array",
			"items": [{ "type": "string" }, { "type": "string" }],
			"contains": { "type": "string", "minLength": 3 },
			"unevaluatedItems": false
		};
		{
			const { textDoc, jsonDoc } = toDocument('["Hello", "Hello", "1"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2019_09);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument('["Hello", "Hello", "Hello"]');

			const semanticErrors = validate2(jsonDoc, textDoc, schema, SchemaDraft.v2019_09);
			assert.strictEqual(semanticErrors!.length, 1);
		}
	});

	test('multipleOf', function () {
		const schema: JSONSchema = {
			type: 'array',
			items: {
				type: 'integer',
				multipleOf: 2
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('[42]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);

			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[43]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);

			assert.strictEqual(semanticErrors!.length, 1);
		}
	});

	test('multipleOf with floats', function () {
		let schema: JSONSchema = {
			type: 'array',
			items: {
				type: 'number',
				multipleOf: 2e-4
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('[0.0002,0.2,0.64,2e+6,2.2e+10]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);

			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('[2e-5,2e-10,1e-4]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);

			assert.strictEqual(semanticErrors!.length, 3);
		}
		schema = {
			type: 'array',
			items: {
				type: 'number',
				multipleOf: 2.000000001
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('[2.000000001e5,6.000000003e8]');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);

			assert.strictEqual(semanticErrors!.length, 0);
		}
	});

	test('dependencies with array / dependentRequired', function () {
		let schema: JSONSchema = {
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
			const { textDoc, jsonDoc } = toDocument('{"a":true, "b":42}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);

			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);

			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"a":true}');

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		schema = {
			"type": "object",

			"properties": {
				"name": { "type": "string" },
				"credit_card": { "type": "number" },
				"billing_address": { "type": "string" }
			},

			"required": ["name"],

			"dependentRequired": {
				"credit_card": ["billing_address"]
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument(`{
				"name": "John Doe",
				"credit_card": 5555555555555555,
				"billing_address": "555 Debtor's Lane"
			  }`);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument(`{
				"name": "John Doe",
				"credit_card": 5555555555555555
			  }`);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument(`{
				"name": "John Doe",
				"billing_address": "555 Debtor's Lane"
			  }`);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
	});

	test('dependencies with schema / dependentSchemas', function () {
		let schema: JSONSchema = {
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
			const { textDoc, jsonDoc } = toDocument('{"a":true, "b":42}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"a":true}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"a":true, "b": "string"}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		schema = {
			"type": "object",

			"properties": {
				"name": { "type": "string" },
				"credit_card": { "type": "number" }
			},

			"required": ["name"],

			"dependentSchemas": {
				"credit_card": {
					"properties": {
						"billing_address": { "type": "string" }
					},
					"required": ["billing_address"]
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument(`{
				"name": "John Doe",
				"credit_card": 5555555555555555,
				"billing_address": "555 Debtor's Lane"
			  }`);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument(`{
				"name": "John Doe",
				"credit_card": 5555555555555555
			  }`);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
		{
			const { textDoc, jsonDoc } = toDocument(`{
				"name": "John Doe",
				"billing_address": "555 Debtor's Lane"
			  }`);
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
	});

	test('type as array', function () {
		const schema: JSONSchema = {
			type: 'object',
			properties: {
				'prop': {
					type: ['number', 'string']
				}
			}
		};

		{
			const { textDoc, jsonDoc } = toDocument('{"prop": 42}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": "string"}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": true}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}
	});

	test('deprecated', function () {

		let schema: JSONSchema = {
			type: 'object',
			properties: {
				'prop': {
					deprecationMessage: "Prop is deprecated"
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": 42}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}

		schema = {
			type: 'object',
			properties: {
				'prop': {
					deprecated: true
				}
			}
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": 42}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}

		schema = {
			deprecated: true,
			type: 'object'
		};
		{
			const { textDoc, jsonDoc } = toDocument('{"prop": 42}');
			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
		}

	});

	test('Strings with spaces', function () {

		const { textDoc, jsonDoc } = toDocument('{"key1":"first string", "key2":["second string"]}');
		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		let node = jsonDoc.getNodeFromOffset(9);
		assert.strictEqual(getNodeValue(node!), 'first string');

		node = jsonDoc.getNodeFromOffset(34);
		assert.strictEqual(getNodeValue(node!), 'second string');

	});

	test('Schema information on node', function () {

		const { jsonDoc } = toDocument('{"key":42}');
		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		const schema: JSONSchema = {
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

		const node = jsonDoc.getNodeFromOffset(7);
		assert.strictEqual(node!.type, 'number');
		assert.strictEqual(getNodeValue(node!), 42);

		const matchingSchemas = jsonDoc.getMatchingSchemas(schema);
		const schemas = matchingSchemas.filter((s) => s.node === node && !s.inverted).map((s) => s.schema);

		assert.ok(Array.isArray(schemas));
		// 0 is the most specific schema,
		// 1 is the schema that contained the "oneOf" clause,
		assert.strictEqual(schemas.length, 2);
		assert.strictEqual(schemas[0].description, 'this is a number');
	});

	test('parse with comments', function () {

		function parse<T>(v: string): T {
			const { jsonDoc } = toDocument(v);
			assert.equal(jsonDoc.syntaxErrors.length, 0);
			return <T>getNodeValue(jsonDoc.root!);
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
			const { jsonDoc } = toDocument(v);
			assert.equal(jsonDoc.comments.length, expectedComments);
		}

		assertParse('// comment\n{\n"far": "boo"\n}', 1);
		assertParse('/* comm\nent\nent */\n{\n"far": "boo"\n}', 1);
		assertParse('{\n"far": "boo"\n}', 0);
	});

	test('validate alternatives', function () {
		const schema: JSONSchema = {
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
			const { textDoc, jsonDoc } = toDocument('{"key":{"type":"foo", "prop2":1 }}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
			assert.strictEqual(semanticErrors![0].message, 'Incorrect type. Expected "boolean".');
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"key":{"type":"bar", "prop1":true, "prop2":false }}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
			assert.strictEqual(semanticErrors![0].message, 'Incorrect type. Expected "number".');
		}
	});

	test('validate alternatives 2', function () {
		const schema: JSONSchema = {
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
			const { textDoc, jsonDoc } = toDocument('{"key":{"type":"foo", "prop2":"x1" }}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
			assert.strictEqual(semanticErrors![0].message, 'Value is not accepted. Valid values: "w1", "w2".');
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"key":{"type":"bar", "prop1":"v1", "prop2":"w1" }}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = validate2(jsonDoc, textDoc, schema);
			assert.strictEqual(semanticErrors!.length, 1);
			assert.strictEqual(semanticErrors![0].message, 'Value is not accepted. Valid values: "x1", "x2".');
		}
	});

	test('enum value merge', function () {
		const schema: JSONSchema = {
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

		const { textDoc, jsonDoc } = toDocument('{"key":3 }');
		assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

		const semanticErrors = validate2(jsonDoc, textDoc, schema);
		assert.strictEqual(semanticErrors!.length, 1);
		assert.strictEqual(semanticErrors![0].message, 'Value is not accepted. Valid values: "a", "b", "c", "d".');
	});

	test('validate DocumentLanguageSettings: trailingCommas', async function () {
		const { textDoc, jsonDoc } = toDocument('{ "pages": [  "pages/index", "pages/log", ] }');

		const ls = getLanguageService({});
		let res = await ls.doValidation(textDoc, jsonDoc);
		assert.strictEqual(res.length, 1);
		assert.strictEqual(res[0].message, 'Trailing comma');
		assert.strictEqual(res[0].severity, DiagnosticSeverity.Error);

		res = await ls.doValidation(textDoc, jsonDoc, {});
		assert.strictEqual(res.length, 1);
		assert.strictEqual(res[0].message, 'Trailing comma');
		assert.strictEqual(res[0].severity, DiagnosticSeverity.Error);

		res = await ls.doValidation(textDoc, jsonDoc, { trailingCommas: 'warning' });
		assert.strictEqual(res.length, 1);
		assert.strictEqual(res[0].message, 'Trailing comma');
		assert.strictEqual(res[0].severity, DiagnosticSeverity.Warning);

		res = await ls.doValidation(textDoc, jsonDoc, { trailingCommas: 'ignore' });
		assert.strictEqual(res.length, 0);

		const schema: JSONSchema = { type: 'object', required: ['foo'] };
		res = await ls.doValidation(textDoc, jsonDoc, { trailingCommas: 'ignore' }, schema);
		assert.strictEqual(res.length, 1);
		assert.strictEqual(res[0].message, 'Missing property "foo".');
	});

	test('validate DocumentLanguageSettings: comments', async function () {
		const { textDoc, jsonDoc } = toDocument('{ "count": 1 /* change */ }');

		const ls = getLanguageService({});
		ls.configure({ allowComments: false });
		let res = await ls.doValidation(textDoc, jsonDoc);
		assert.strictEqual(res.length, 1);
		assert.strictEqual(res[0].message, 'Comments are not permitted in JSON.');
		assert.strictEqual(res[0].severity, DiagnosticSeverity.Error);

		res = await ls.doValidation(textDoc, jsonDoc, {});
		assert.strictEqual(res.length, 1);
		assert.strictEqual(res[0].message, 'Comments are not permitted in JSON.');
		assert.strictEqual(res[0].severity, DiagnosticSeverity.Error);

		res = await ls.doValidation(textDoc, jsonDoc, { comments: 'ignore' });
		assert.strictEqual(res.length, 0);

		res = await ls.doValidation(textDoc, jsonDoc, { comments: 'warning' });
		assert.strictEqual(res.length, 1);
		assert.strictEqual(res[0].message, 'Comments are not permitted in JSON.');
		assert.strictEqual(res[0].severity, DiagnosticSeverity.Warning);

	});


});
