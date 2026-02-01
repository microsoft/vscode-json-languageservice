/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isKeywordEnabled } from '../services/vocabularies';

suite('Vocabularies', () => {

	suite('isKeywordEnabled', () => {

		test('returns true for all keywords when activeVocabularies is undefined', function () {
			// When no vocabulary constraints, all keywords should be enabled
			assert.strictEqual(isKeywordEnabled('type', undefined), true);
			assert.strictEqual(isKeywordEnabled('properties', undefined), true);
			assert.strictEqual(isKeywordEnabled('minimum', undefined), true);
			assert.strictEqual(isKeywordEnabled('format', undefined), true);
			assert.strictEqual(isKeywordEnabled('$ref', undefined), true);
			assert.strictEqual(isKeywordEnabled('allOf', undefined), true);
			assert.strictEqual(isKeywordEnabled('unknownKeyword', undefined), true);
		});

		test('returns true for core keywords regardless of vocabulary settings', function () {
			// Core keywords should always be enabled, even with empty vocabularies
			const emptyVocabs = new Set<string>();
			assert.strictEqual(isKeywordEnabled('$id', emptyVocabs), true);
			assert.strictEqual(isKeywordEnabled('$schema', emptyVocabs), true);
			assert.strictEqual(isKeywordEnabled('$ref', emptyVocabs), true);
			assert.strictEqual(isKeywordEnabled('$anchor', emptyVocabs), true);
			assert.strictEqual(isKeywordEnabled('$defs', emptyVocabs), true);
			assert.strictEqual(isKeywordEnabled('$comment', emptyVocabs), true);
			assert.strictEqual(isKeywordEnabled('$vocabulary', emptyVocabs), true);
		});

		test('returns true for validation keywords when validation vocabulary is active (2019-09)', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/core',
				'https://json-schema.org/draft/2019-09/vocab/validation'
			]);
			assert.strictEqual(isKeywordEnabled('type', vocabs), true);
			assert.strictEqual(isKeywordEnabled('enum', vocabs), true);
			assert.strictEqual(isKeywordEnabled('const', vocabs), true);
			assert.strictEqual(isKeywordEnabled('minimum', vocabs), true);
			assert.strictEqual(isKeywordEnabled('maximum', vocabs), true);
			assert.strictEqual(isKeywordEnabled('minLength', vocabs), true);
			assert.strictEqual(isKeywordEnabled('maxLength', vocabs), true);
			assert.strictEqual(isKeywordEnabled('pattern', vocabs), true);
			assert.strictEqual(isKeywordEnabled('required', vocabs), true);
			assert.strictEqual(isKeywordEnabled('multipleOf', vocabs), true);
		});

		test('returns false for validation keywords when validation vocabulary is NOT active', function () {
			// Only core vocabulary - validation keywords should be disabled
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/core'
			]);
			assert.strictEqual(isKeywordEnabled('type', vocabs), false);
			assert.strictEqual(isKeywordEnabled('enum', vocabs), false);
			assert.strictEqual(isKeywordEnabled('const', vocabs), false);
			assert.strictEqual(isKeywordEnabled('minimum', vocabs), false);
			assert.strictEqual(isKeywordEnabled('maximum', vocabs), false);
			assert.strictEqual(isKeywordEnabled('required', vocabs), false);
		});

		test('returns true for applicator keywords when applicator vocabulary is active (2019-09)', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/core',
				'https://json-schema.org/draft/2019-09/vocab/applicator'
			]);
			assert.strictEqual(isKeywordEnabled('properties', vocabs), true);
			assert.strictEqual(isKeywordEnabled('patternProperties', vocabs), true);
			assert.strictEqual(isKeywordEnabled('additionalProperties', vocabs), true);
			assert.strictEqual(isKeywordEnabled('items', vocabs), true);
			assert.strictEqual(isKeywordEnabled('allOf', vocabs), true);
			assert.strictEqual(isKeywordEnabled('anyOf', vocabs), true);
			assert.strictEqual(isKeywordEnabled('oneOf', vocabs), true);
			assert.strictEqual(isKeywordEnabled('not', vocabs), true);
			assert.strictEqual(isKeywordEnabled('if', vocabs), true);
			assert.strictEqual(isKeywordEnabled('then', vocabs), true);
			assert.strictEqual(isKeywordEnabled('else', vocabs), true);
		});

		test('returns false for applicator keywords when applicator vocabulary is NOT active', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/core',
				'https://json-schema.org/draft/2019-09/vocab/validation'
			]);
			assert.strictEqual(isKeywordEnabled('properties', vocabs), false);
			assert.strictEqual(isKeywordEnabled('allOf', vocabs), false);
			assert.strictEqual(isKeywordEnabled('anyOf', vocabs), false);
			assert.strictEqual(isKeywordEnabled('if', vocabs), false);
		});

		test('returns true for format keyword when format vocabulary is active (2019-09)', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/format'
			]);
			assert.strictEqual(isKeywordEnabled('format', vocabs), true);
		});

		test('returns false for format keyword when format vocabulary is NOT active', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/core',
				'https://json-schema.org/draft/2019-09/vocab/validation'
			]);
			assert.strictEqual(isKeywordEnabled('format', vocabs), false);
		});

		test('returns true for validation keywords when validation vocabulary is active (2020-12)', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2020-12/vocab/core',
				'https://json-schema.org/draft/2020-12/vocab/validation'
			]);
			assert.strictEqual(isKeywordEnabled('type', vocabs), true);
			assert.strictEqual(isKeywordEnabled('enum', vocabs), true);
			assert.strictEqual(isKeywordEnabled('minimum', vocabs), true);
			assert.strictEqual(isKeywordEnabled('required', vocabs), true);
		});

		test('returns true for unevaluated keywords when unevaluated vocabulary is active (2020-12)', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2020-12/vocab/core',
				'https://json-schema.org/draft/2020-12/vocab/unevaluated'
			]);
			assert.strictEqual(isKeywordEnabled('unevaluatedItems', vocabs), true);
			assert.strictEqual(isKeywordEnabled('unevaluatedProperties', vocabs), true);
		});

		test('returns false for unevaluated keywords when unevaluated vocabulary is NOT active', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2020-12/vocab/core',
				'https://json-schema.org/draft/2020-12/vocab/applicator'
			]);
			assert.strictEqual(isKeywordEnabled('unevaluatedItems', vocabs), false);
			assert.strictEqual(isKeywordEnabled('unevaluatedProperties', vocabs), false);
		});

		test('returns true for format keyword with format-annotation vocabulary (2020-12)', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2020-12/vocab/format-annotation'
			]);
			assert.strictEqual(isKeywordEnabled('format', vocabs), true);
		});

		test('returns true for format keyword with format-assertion vocabulary (2020-12)', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2020-12/vocab/format-assertion'
			]);
			assert.strictEqual(isKeywordEnabled('format', vocabs), true);
		});

		test('returns false for unknown keywords when vocabularies are restricted', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/core'
			]);
			assert.strictEqual(isKeywordEnabled('customKeyword', vocabs), false);
			assert.strictEqual(isKeywordEnabled('x-extension', vocabs), false);
		});

		test('handles mixed 2019-09 and 2020-12 vocabularies', function () {
			// This is an unusual case but should work
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/validation',
				'https://json-schema.org/draft/2020-12/vocab/applicator'
			]);
			assert.strictEqual(isKeywordEnabled('type', vocabs), true); // from 2019-09 validation
			assert.strictEqual(isKeywordEnabled('properties', vocabs), true); // from 2020-12 applicator
		});

		test('meta-data vocabulary keywords', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/meta-data'
			]);
			// Meta-data keywords are typically not used in validation, but should be recognized
			assert.strictEqual(isKeywordEnabled('title', vocabs), true);
			assert.strictEqual(isKeywordEnabled('description', vocabs), true);
			assert.strictEqual(isKeywordEnabled('default', vocabs), true);
			assert.strictEqual(isKeywordEnabled('deprecated', vocabs), true);
		});

		test('content vocabulary keywords', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/content'
			]);
			assert.strictEqual(isKeywordEnabled('contentEncoding', vocabs), true);
			assert.strictEqual(isKeywordEnabled('contentMediaType', vocabs), true);
			assert.strictEqual(isKeywordEnabled('contentSchema', vocabs), true);
		});

		test('$recursiveRef and $recursiveAnchor are core keywords in 2019-09', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/core'
			]);
			assert.strictEqual(isKeywordEnabled('$recursiveRef', vocabs), true);
			assert.strictEqual(isKeywordEnabled('$recursiveAnchor', vocabs), true);
		});

		test('$dynamicRef and $dynamicAnchor are core keywords in 2020-12', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2020-12/vocab/core'
			]);
			assert.strictEqual(isKeywordEnabled('$dynamicRef', vocabs), true);
			assert.strictEqual(isKeywordEnabled('$dynamicAnchor', vocabs), true);
		});

		test('prefixItems is an applicator keyword', function () {
			const vocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/applicator'
			]);
			assert.strictEqual(isKeywordEnabled('prefixItems', vocabs), true);

			const vocabs2 = new Set<string>([
				'https://json-schema.org/draft/2020-12/vocab/applicator'
			]);
			assert.strictEqual(isKeywordEnabled('prefixItems', vocabs2), true);
		});

		test('dependentSchemas and dependentRequired are in correct vocabularies', function () {
			// dependentSchemas is an applicator keyword
			const applicatorVocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/applicator'
			]);
			assert.strictEqual(isKeywordEnabled('dependentSchemas', applicatorVocabs), true);

			// dependentRequired is a validation keyword
			const validationVocabs = new Set<string>([
				'https://json-schema.org/draft/2019-09/vocab/validation'
			]);
			assert.strictEqual(isKeywordEnabled('dependentRequired', validationVocabs), true);
		});
	});
});
