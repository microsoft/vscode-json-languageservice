/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import {
	ClientCapabilities,
	DocumentLink,
	getLanguageService,
	JSONSchema,
	Range,
	TextDocument,
} from '../jsonLanguageService';
import * as path from 'path';
import { URI } from 'vscode-uri';

suite('JSON Find Links', () => {
	const testFindLinksFor = function (value: string, expected: {offset: number, length: number, target: number} | null): PromiseLike<void> {

		const ls = getLanguageService({ clientCapabilities: ClientCapabilities.LATEST });
		const document = TextDocument.create('test://test/test.json', 'json', 0, value);
		const jsonDoc = ls.parseJSONDocument(document);
		return ls.findLinks(document, jsonDoc).then(list => {
			if (expected) {
				assert.notDeepEqual(list, []);
				const expectedPos = document.positionAt(expected.target);
				const expectedTarget = `${document.uri}#${expectedPos.line + 1},${expectedPos.character + 1}`;
				assert.equal(list[0].target, expectedTarget);
				assert.deepEqual(list[0].range, Range.create(document.positionAt(expected.offset), document.positionAt(expected.offset + expected.length)));
			} else {
				assert.deepEqual(list, []);
			}
		});
	};

	function testFindLinksWithSchema(document: TextDocument, schema: JSONSchema): PromiseLike<DocumentLink[]> {
		const schemaUri = "http://myschemastore/test1";

		const ls = getLanguageService({ clientCapabilities: ClientCapabilities.LATEST });
		ls.configure({ schemas: [{ fileMatch: ["*.json"], uri: schemaUri, schema }] });
		const jsonDoc = ls.parseJSONDocument(document);

		return ls.findLinks(document, jsonDoc);
	}

	test('FindDefinition invalid ref', async function () {
		await testFindLinksFor('{}', null);
		await testFindLinksFor('{"name": "John"}', null);
		await testFindLinksFor('{"name": "John", "$ref": "#/john/name"}', null);
		await testFindLinksFor('{"name": "John", "$ref": "#/"}', null);
	});

	test('FindDefinition valid ref', async function () {
		await testFindLinksFor('{"name": "John", "$ref": "#/name"}', {target: 9, offset: 26, length: 6});
		await testFindLinksFor('{"name": "John", "$ref": "#"}', {target: 0, offset: 26, length: 1});

		const doc = (ref: string) => `{"foo": ["bar", "baz"],"": 0,"a/b": 1,"c%d": 2,"e^f": 3,"i\\\\j": 5,"k\\"l": 6," ": 7,"m~n": 8, "$ref": "${ref}"}`;
		await testFindLinksFor(doc('#'), {target: 0, offset: 102, length: 1});
		await testFindLinksFor(doc('#/foo'), {target: 8, offset: 102, length: 5});
		await testFindLinksFor(doc('#/foo/0'), {target: 9, offset: 102, length: 7});
		await testFindLinksFor(doc('#/foo/1'), {target: 16, offset: 102, length: 7});
		await testFindLinksFor(doc('#/foo/01'), null);
		await testFindLinksFor(doc('#/'), {target: 27, offset: 102, length: 2});
		await testFindLinksFor(doc('#/a~1b'), {target: 36, offset: 102, length: 6});
		await testFindLinksFor(doc('#/c%d'), {target: 45, offset: 102, length: 5});
		await testFindLinksFor(doc('#/e^f'), {target: 54, offset: 102, length: 5});
		await testFindLinksFor(doc('#/i\\\\j'), {target: 64, offset: 102, length: 6});
		await testFindLinksFor(doc('#/k\\"l'), {target: 74, offset: 102, length: 6});
		await testFindLinksFor(doc('#/ '), {target: 81, offset: 102, length: 3});
		await testFindLinksFor(doc('#/m~0n'), {target: 90, offset: 102, length: 6});
	});

	test('URI reference link', async function () {
		// This test file runs in `./lib/umd/test`, but the fixtures are in `./src`.
		const refRelPath = '../../../src/test/fixtures/uri-reference.txt';
		const refAbsPath = path.join(__dirname, refRelPath);
		const docAbsPath = path.join(__dirname, 'test.json');

		const content = `{"stringProp": "string-value", "uriProp": "${refRelPath}", "uriPropNotFound": "./does/not/exist.txt"}`;
		const document = TextDocument.create(URI.file(docAbsPath).toString(), 'json', 0, content);
		const schema: JSONSchema = {
			type: 'object',
			properties: {
				'stringProp': {
					type: 'string',
				},
				'uriProp': {
					type: 'string',
					format: 'uri-reference'
				},
				'uriPropNotFound': {
					type: 'string',
					format: 'uri-reference'
				}
			}
		};
		await testFindLinksWithSchema(document, schema).then((links) => {
			assert.notDeepEqual(links, []);

			assert.equal(links[0].target, URI.file(refAbsPath).toString());

			const startOffset = content.indexOf(refRelPath);
			const endOffset = startOffset + refRelPath.length;
			const range = Range.create(document.positionAt(startOffset), document.positionAt(endOffset));
			assert.deepEqual(links[0].range, range);
		});
	});

});
