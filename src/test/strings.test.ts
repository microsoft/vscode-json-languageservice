/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'node:test';
import { getLanguageService, TextDocument } from '../jsonLanguageService.js';
import { stringLength } from '../utils/strings.js';

suite('Unicode string length', () => {

	const cases = [
		{ name: 'empty string', value: '', length: 0 },
		{ name: 'ASCII', value: 'abc', length: 3 },
		{ name: 'BMP characters', value: '\u00e9\u6c34', length: 2 },
		{ name: 'surrogate pair', value: '\uD83D\uDE80', length: 1 },
		{ name: 'lowest surrogate pair', value: '\uD800\uDC00', length: 1 },
		{ name: 'highest surrogate pair', value: '\uDBFF\uDFFF', length: 1 },
		{ name: 'lone high surrogate', value: '\uD800', length: 1 },
		{ name: 'lone low surrogate', value: '\uDC00', length: 1 },
		{ name: 'high surrogate before ASCII', value: '\uD800a', length: 2 },
		{ name: 'high surrogate before BMP character', value: '\uDBFF\uE000', length: 2 },
		{ name: 'consecutive high surrogates', value: '\uD800\uDBFF', length: 2 },
		{ name: 'high surrogate before a pair', value: '\uD800\uD83D\uDE80', length: 2 },
		{ name: 'low and high surrogates before ASCII', value: '\uDC00\uD800a', length: 3 },
		{ name: 'pair and high surrogate before ASCII', value: '\uD83D\uDE80\uD800a', length: 3 },
		{ name: 'trailing high surrogate', value: 'a\uDBFF', length: 2 },
	];

	for (const { name, value, length } of cases) {
		test(`counts ${name}`, () => {
			assert.strictEqual(stringLength(value), length);
		});

		for (const keyword of ['minLength', 'maxLength'] as const) {
			test(`validates ${keyword} for ${name}`, async () => {
				const service = getLanguageService({});
				const document = TextDocument.create('test://test/length.json', 'json', 0, JSON.stringify(value));
				const jsonDocument = service.parseJSONDocument(document);

				const schema = { type: 'string', [keyword]: length };
				assert.deepStrictEqual(await service.doValidation(document, jsonDocument, undefined, schema), []);

				if (keyword === 'minLength' || length > 0) {
					const invalidLength = keyword === 'minLength' ? length + 1 : length - 1;
					const diagnostics = await service.doValidation(document, jsonDocument, undefined, { type: 'string', [keyword]: invalidLength });
					assert.deepStrictEqual(diagnostics.map(diagnostic => diagnostic.message), [keyword === 'minLength'
						? `String is shorter than the minimum length of ${invalidLength}.`
						: `String is longer than the maximum length of ${invalidLength}.`]);
				}
			});
		}
	}
});
