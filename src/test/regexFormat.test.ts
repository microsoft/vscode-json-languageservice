/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'node:test';
import { getLanguageService, JSONSchema, Range, TextDocument } from '../jsonLanguageService.js';

suite('Regex format validation', () => {

	async function validate(value: unknown, schema: JSONSchema = { format: 'regex' }) {
		const text = JSON.stringify(value);
		const document = TextDocument.create('test://regex/value.json', 'json', 0, text);
		const service = getLanguageService({});
		return service.doValidation(document, service.parseJSONDocument(document), {}, schema);
	}

	test('reports invalid regular expressions at the string value', async () => {
		for (const value of ['[', '(', '*', '[z-a]', 'a{2,1}', '\\']) {
			const diagnostics = await validate(value);
			assert.strictEqual(diagnostics.length, 1, value);
			assert.strictEqual(diagnostics[0].message, 'String is not a regular expression.');
			assert.deepStrictEqual(diagnostics[0].range, Range.create(0, 0, 0, JSON.stringify(value).length));
		}
	});

	test('accepts valid ECMAScript expressions including the empty expression', async () => {
		for (const value of ['', '^a+$', '\\d{2,4}', '(?:a|b)', '(?=a)a', '[\\u0000-\\uffff]', 'a/b', '(a+)+$']) {
			assert.deepStrictEqual(await validate(value), [], value);
		}
	});

	test('does not accept non-ECMAScript global inline flags', async () => {
		assert.strictEqual((await validate('(?i)abc')).length, 1);
	});

	test('ignores non-string instances and unrecognized formats', async () => {
		for (const value of [42, true, null, [], {}]) {
			assert.deepStrictEqual(await validate(value), []);
		}
		assert.deepStrictEqual(await validate('[', { format: 'unknown-format' }), []);
	});

	test('preserves custom error message precedence', async () => {
		for (const schema of [
			{ format: 'regex', errorMessage: 'Custom error' },
			{ format: 'regex', errorMessage: 'Fallback', patternErrorMessage: 'Custom error' }
		]) {
			const diagnostics = await validate('[', schema);
			assert.strictEqual(diagnostics.length, 1);
			assert.strictEqual(diagnostics[0].message, 'Custom error');
		}
	});

	test('validates draft-07 but preserves annotation-only defaults in newer drafts', async () => {
		for (const [$schema, expected] of [
			['http://json-schema.org/draft-07/schema#', 1],
			['https://json-schema.org/draft/2019-09/schema', 0],
			['https://json-schema.org/draft/2020-12/schema', 0]
		] as const) {
			assert.strictEqual((await validate('[', { $schema, format: 'regex' })).length, expected, $schema);
		}
	});

	test('respects custom dialect format vocabulary selection', async () => {
		for (const [vocabulary, expected] of [
			['format-assertion', 1],
			['format-annotation', 0],
			['validation', 0]
		] as const) {
			const dialectUri = `https://example.com/${vocabulary}`;
			const service = getLanguageService({
				schemaRequestService: async () => JSON.stringify({
					$schema: 'https://json-schema.org/draft/2020-12/schema',
					$vocabulary: {
						'https://json-schema.org/draft/2020-12/vocab/core': true,
						[`https://json-schema.org/draft/2020-12/vocab/${vocabulary}`]: true
					}
				})
			});
			const document = TextDocument.create('test://regex/value.json', 'json', 0, '"["');
			const diagnostics = await service.doValidation(document, service.parseJSONDocument(document), {}, {
				$schema: dialectUri, format: 'regex'
			});
			assert.strictEqual(diagnostics.length, expected, vocabulary);
		}
	});

	test('validates patterns used as object property names', async () => {
		const diagnostics = await validate({ '[': true }, { propertyNames: { format: 'regex' } });
		assert.strictEqual(diagnostics.length, 1);
		assert.deepStrictEqual(diagnostics[0].range, Range.create(0, 1, 0, 4));
	});
});
