/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'node:test';
import { getLanguageService, JSONSchema, SchemaDraft, TextDocument } from '../jsonLanguageService.js';
import { JSONDocument } from '../parser/jsonParser.js';

suite('Combined schema drafts', () => {

	function createService(schemas: JSONSchema[]) {
		const service = getLanguageService({});
		service.configure({ schemas: schemas.map((schema, index) => ({
			uri: `https://example.com/schema${index}.json`, fileMatch: ['*.json'], schema
		})) });
		return service;
	}

	for (const draft of ['draft-04', 'draft-06', 'draft-07', 'draft/2019-09']) {
		test(`tuple validation keeps ${draft} when another schema is associated`, async () => {
			const tuple: JSONSchema = {
				$schema: `https://json-schema.org/${draft}/schema`,
				type: 'array', items: [{ type: 'string' }, { type: 'integer' }], additionalItems: false
			};
			for (const schemas of [[tuple, {}], [{}, tuple]]) {
				const service = createService(schemas);
				for (const [text, errors] of [['[42,"foo"]', 2], ['["foo",42]', 0], ['["foo",42,true]', 1]] as const) {
					const document = TextDocument.create('file:///test.json', 'json', 0, text);
					const json = service.parseJSONDocument(document);
					const diagnostics = await service.doValidation(document, json);
					assert.strictEqual(diagnostics.length, errors, text);
				}
				const document = TextDocument.create('file:///test.json', 'json', 0, '[42,"foo"]');
				const matching = await service.getMatchingSchemas(document, service.parseJSONDocument(document));
				assert.ok(matching.some(match => match.node.offset === 1 && match.schema.type === 'string'));
				assert.ok(matching.some(match => match.node.offset === 4 && match.schema.type === 'integer'));
			}
		});
	}

	test('mixed drafts keep their own array semantics in either association order', async () => {
		const legacy: JSONSchema = {
			$schema: 'https://json-schema.org/draft-07/schema',
			items: [{ type: 'string' }]
		};
		const modern: JSONSchema = {
			$schema: 'https://json-schema.org/draft/2020-12/schema',
			prefixItems: [{}, { type: 'integer' }], items: false
		};
		for (const schemas of [[legacy, modern], [modern, legacy]]) {
			const service = createService(schemas);
			for (const [text, errors] of [['["foo",42]', 0], ['[42,42]', 1], ['["foo","bar"]', 1], ['["foo",42,true]', 1]] as const) {
				const document = TextDocument.create('file:///test.json', 'json', 0, text);
				const diagnostics = await service.doValidation(document, service.parseJSONDocument(document));
				assert.strictEqual(diagnostics.length, errors, text);
			}
		}
	});

	test('an explicit document draft retains its existing precedence', async () => {
		const service = createService([{
			$schema: 'https://json-schema.org/draft-07/schema', items: [{ type: 'string' }]
		}, {}]);
		const document = TextDocument.create('file:///test.json', 'json', 0, '[42]');
		const json = service.parseJSONDocument(document);
		assert.deepStrictEqual(await service.doValidation(document, json, { schemaDraft: SchemaDraft.v2020_12 }), []);
		assert.strictEqual((await service.doValidation(document, json, { schemaDraft: SchemaDraft.v7 })).length, 1);
	});

	test('a declared dialect resets inherited vocabulary restrictions only within its branch', () => {
		const service = getLanguageService({});
		const document = TextDocument.create('file:///test.json', 'json', 0, '{"declared":1,"inherited":1}');
		const json = service.parseJSONDocument(document) as JSONDocument;
		const schema: JSONSchema = {
			$schema: 'https://example.com/custom-dialect',
			properties: {
				declared: { $id: 'https://example.com/declared', $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string' },
				inherited: { type: 'string' }
			}
		};
		const vocabularies = new Map([
			['https://json-schema.org/draft/2020-12/vocab/core', true],
			['https://json-schema.org/draft/2020-12/vocab/applicator', true]
		]);
		const diagnostics = json.validate(document, schema, undefined, undefined, vocabularies);
		assert.strictEqual(diagnostics?.length, 1);
		assert.strictEqual(diagnostics[0].range.start.character, 12);
	});

	test('format assertions use each declared draft without changing undeclared siblings', async () => {
		const legacy: JSONSchema = { $schema: 'https://json-schema.org/draft-07/schema', format: 'email' };
		const modern: JSONSchema = { $schema: 'https://json-schema.org/draft/2020-12/schema', format: 'email' };
		for (const [other, errors] of [[legacy, 1], [{}, 0], [{ format: 'email' }, 1]] as const) {
			for (const schemas of [[modern, other], [other, modern]]) {
				const service = createService(schemas);
				const document = TextDocument.create('file:///test.json', 'json', 0, '"not an email"');
				assert.strictEqual((await service.doValidation(document, service.parseJSONDocument(document))).length, errors);
			}
		}
	});
});
