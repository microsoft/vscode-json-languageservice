/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import { getLanguageService, JSONSchema, TextDocument, ClientCapabilities, CompletionList, CompletionItemKind, Position, MarkupContent } from '../jsonLanguageService';
import { repeat } from '../utils/strings';
import { DefinitionLink } from 'vscode-languageserver-types';

suite('JSON Find Definitions', () => {
	const testFindDefinitionFor = function (value: string, expected: {offset: number, length: number} | null): void {
		const offset = value.indexOf('|');
		value = value.substr(0, offset) + value.substr(offset + 1);

		const ls = getLanguageService({ clientCapabilities: ClientCapabilities.LATEST });
		const document = TextDocument.create('test://test/test.json', 'json', 0, value);
		const position = Position.create(0, offset);
		const jsonDoc = ls.parseJSONDocument(document);
		const list = ls.findDefinition(document, position, jsonDoc);
		if (expected) {
			assert.notDeepEqual(list, []);
			const startOffset = list[0].targetRange.start.character;
			assert.equal(startOffset, expected.offset);
			assert.equal(list[0].targetRange.end.character - startOffset, expected.length);
		} else {
			assert.deepEqual(list, []);
		}

	};

	test('FindDefinition invalid ref', function () {
		testFindDefinitionFor('{|}', null);
		testFindDefinitionFor('{"name": |"John"}', null);
		testFindDefinitionFor('{"|name": "John"}', null);
		testFindDefinitionFor('{"name": "|John"}', null);
		testFindDefinitionFor('{"name": "John", "$ref": "#/|john/name"}', null);
		testFindDefinitionFor('{"name": "John", "$ref|": "#/name"}', null);
		testFindDefinitionFor('{"name": "John", "$ref": "#/|"}', null);
	});

	test('FindDefinition valid ref', function () {
		testFindDefinitionFor('{"name": "John", "$ref": "#/n|ame"}', {offset: 9, length: 6});
		testFindDefinitionFor('{"name": "John", "$ref": "|#/name"}', {offset: 9, length: 6});
		testFindDefinitionFor('{"name": "John", "$ref": |"#/name"}', {offset: 9, length: 6});
		testFindDefinitionFor('{"name": "John", "$ref": "#/name"|}', {offset: 9, length: 6});
		testFindDefinitionFor('{"name": "John", "$ref": "#/name|"}', {offset: 9, length: 6});
		testFindDefinitionFor('{"name": "John", "$ref": "#|"}', {offset: 0, length: 29});

		const doc = (ref: string) => `{"foo": ["bar", "baz"],"": 0,"a/b": 1,"c%d": 2,"e^f": 3,"i\\\\j": 5,"k\\"l": 6," ": 7,"m~n": 8, "$ref": "|${ref}"}`;
		testFindDefinitionFor(doc('#'), {offset: 0, length: 105});
		testFindDefinitionFor(doc('#/foo'), {offset: 8, length: 14});
		testFindDefinitionFor(doc('#/foo/0'), {offset: 9, length: 5});
		testFindDefinitionFor(doc('#/foo/1'), {offset: 16, length: 5});
		testFindDefinitionFor(doc('#/foo/01'), null);
		testFindDefinitionFor(doc('#/'), {offset: 27, length: 1});
		testFindDefinitionFor(doc('#/a~1b'), {offset: 36, length: 1});
		testFindDefinitionFor(doc('#/c%d'), {offset: 45, length: 1});
		testFindDefinitionFor(doc('#/e^f'), {offset: 54, length: 1});
		testFindDefinitionFor(doc('#/i\\\\j'), {offset: 64, length: 1});
		testFindDefinitionFor(doc('#/k\\"l'), {offset: 74, length: 1});
		testFindDefinitionFor(doc('#/ '), {offset: 81, length: 1});
		testFindDefinitionFor(doc('#/m~0n'), {offset: 90, length: 1});
	});
});
