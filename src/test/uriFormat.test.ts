/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'node:test';
import { getLanguageService, JSONSchema, Range, TextDocument } from '../jsonLanguageService.js';

suite('URI format validation', () => {

	async function validate(value: unknown, schema: JSONSchema) {
		const document = TextDocument.create('test://uri/value.json', 'json', 0, JSON.stringify(value));
		const service = getLanguageService({});
		return service.doValidation(document, service.parseJSONDocument(document), {}, schema);
	}

	test('accepts empty same-document URI references', async () => {
		assert.deepStrictEqual(await validate('', { format: 'uri-reference' }), []);
	});

	for (const $schema of ['http://json-schema.org/draft-06/schema#', 'http://json-schema.org/draft-07/schema#']) {
		test(`accepts empty URI references in ${$schema}`, async () => {
			assert.deepStrictEqual(await validate('', { $schema, format: 'uri-reference' }), []);
		});
	}

	test('continues to reject empty absolute URIs at the string value', async () => {
		const diagnostics = await validate('', { format: 'uri' });
		assert.strictEqual(diagnostics.length, 1);
		assert.strictEqual(diagnostics[0].message, 'String is not a URI: URI expected.');
		assert.deepStrictEqual(diagnostics[0].range, Range.create(0, 0, 0, 2));
	});

	test('retains minLength constraints on URI references', async () => {
		const diagnostics = await validate('', { format: 'uri-reference', minLength: 1 });
		assert.strictEqual(diagnostics.length, 1);
		assert.strictEqual(diagnostics[0].message, 'String is shorter than the minimum length of 1.');
	});

	test('accepts nonempty relative and absolute URI references', async () => {
		for (const value of ['#', '#fragment', '?query', '../file.json', '//example.com/path', 'https://example.com/path']) {
			assert.deepStrictEqual(await validate(value, { format: 'uri-reference' }), [], value);
		}
	});

	test('continues to reject whitespace and backslashes', async () => {
		for (const format of ['uri', 'uri-reference']) {
			for (const value of [' ', '\t', '\n', '\\', 'https://example.com/a b', 'https://example.com/a\\b']) {
				const diagnostics = await validate(value, { format });
				assert.strictEqual(diagnostics.length, 1, `${format}: ${JSON.stringify(value)}`);
				assert.strictEqual(diagnostics[0].message, 'String is not a URI: URI must not contain backslashes or whitespace.');
			}
		}
	});

	test('accepts an empty property name constrained to URI references', async () => {
		assert.deepStrictEqual(await validate({ '': true }, { propertyNames: { format: 'uri-reference' } }), []);
	});

	test('preserves annotation-only format behavior in newer drafts', async () => {
		for (const $schema of ['https://json-schema.org/draft/2019-09/schema', 'https://json-schema.org/draft/2020-12/schema']) {
			for (const format of ['uri', 'uri-reference']) {
				assert.deepStrictEqual(await validate('', { $schema, format }), [], `${$schema}: ${format}`);
			}
		}
	});
});
