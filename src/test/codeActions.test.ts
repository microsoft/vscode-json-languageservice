/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'node:test';

import {
	CodeActionKind, Diagnostic, ErrorCode, Range, TextDocument, TextDocumentEdit, TextEdit,
	getLanguageService
} from '../jsonLanguageService.js';

suite('JSON Code Actions', () => {

	async function testRemoveTrailingComma(content: string, expected: string): Promise<void> {
		const service = getLanguageService({});
		const document = TextDocument.create('test://test/test.json', 'json', 7, content);
		const jsonDocument = service.parseJSONDocument(document);
		const diagnostics = await service.doValidation(document, jsonDocument);
		const diagnostic = diagnostics.find(candidate => candidate.code === ErrorCode.TrailingComma);
		assert.ok(diagnostic, 'Expected a trailing comma diagnostic');

		const actions = service.doCodeActions(document, diagnostic.range, { diagnostics });
		assert.strictEqual(actions.length, 1);
		const action = actions[0];
		assert.strictEqual(action.title, 'Remove trailing comma');
		assert.strictEqual(action.kind, CodeActionKind.QuickFix);
		assert.deepStrictEqual(action.diagnostics, [diagnostic]);
		assert.ok(action.edit?.documentChanges);
		assert.strictEqual(action.edit.documentChanges.length, 1);

		const change = action.edit.documentChanges[0];
		assert.ok(TextDocumentEdit.is(change));
		assert.strictEqual(change.textDocument.uri, document.uri);
		assert.strictEqual(change.textDocument.version, document.version);
		assert.ok(change.edits.every(TextEdit.is));
		assert.strictEqual(TextDocument.applyEdits(document, change.edits), expected);
	}

	test('removes an object trailing comma', async () => {
		await testRemoveTrailingComma('{ "name": "value", }', '{ "name": "value" }');
	});

	test('removes an array trailing comma', async () => {
		await testRemoveTrailingComma('[1, 2, ]', '[1, 2 ]');
	});

	test('filters diagnostics outside the requested range', async () => {
		const service = getLanguageService({});
		const document = TextDocument.create('test://test/test.json', 'json', 0, '{ "name": "value", }');
		const jsonDocument = service.parseJSONDocument(document);
		const diagnostics = await service.doValidation(document, jsonDocument);

		const actions = service.doCodeActions(document, Range.create(0, 0, 0, 0), { diagnostics });

		assert.deepStrictEqual(actions, []);
	});

	test('does not edit text for unrelated or stale diagnostics', () => {
		const service = getLanguageService({});
		const document = TextDocument.create('test://test/test.json', 'json', 0, '{ "name": "value", }');
		const commaOffset = document.getText().indexOf(',');
		const commaRange = Range.create(document.positionAt(commaOffset), document.positionAt(commaOffset + 1));
		const unrelated = Diagnostic.create(commaRange, 'Comment not permitted', undefined, ErrorCode.CommentNotPermitted);
		const stale = Diagnostic.create(Range.create(0, 2, 0, 8), 'Trailing comma', undefined, ErrorCode.TrailingComma);

		assert.deepStrictEqual(service.doCodeActions(document, commaRange, { diagnostics: [unrelated] }), []);
		assert.deepStrictEqual(service.doCodeActions(document, stale.range, { diagnostics: [stale] }), []);
	});
});
