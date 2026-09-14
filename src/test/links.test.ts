/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { suite, test } from 'node:test';

import { getLanguageService, Range, TextDocument, ClientCapabilities } from '../jsonLanguageService.js';

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

	for (const [key, fragment] of [
		['foo:bar', '#/$defs/foo%3Abar'],
		['foo bar', '#/$defs/foo%20bar'],
		['café', '#/$defs/caf%C3%A9'],
		['a/b', '#/$defs/a%7E1b'],
		['m~n', '#/$defs/m%7E0n'],
		['%20', '#/$defs/%2520'],
		['foo', '#%2F$defs%2Ffoo']
	]) {
		test(`FindDefinition percent-encoded pointer ${fragment}`, async function () {
			const value = JSON.stringify({ $defs: { [key]: { type: 'string' } }, $ref: fragment });
			await testFindLinksFor(value, {
				target: value.indexOf('{"type"'),
				offset: value.indexOf(fragment),
				length: fragment.length
			});
		});
	}

	test('FindDefinition percent-encoded anchor', async function () {
		const value = '{"$defs":{"x":{"$anchor":"myAnchor"}},"$ref":"#my%41nchor"}';
		await testFindLinksFor(value, { target: value.indexOf('{"$anchor"'), offset: value.indexOf('#my'), length: 11 });
	});

	test('FindDefinition encoded fragment in embedded schema', async function () {
		const uri = 'https://example.com/schema%20name';
		for (const fragment of ['#/$defs/foo%20bar', '#my%41nchor']) {
			const ref = uri + fragment;
			const value = JSON.stringify({
				$defs: { embedded: { $id: uri, $defs: { 'foo bar': { $anchor: 'myAnchor' } } } },
				$ref: ref
			});
			await testFindLinksFor(value, {
				target: value.indexOf('{"$anchor"'),
				offset: value.indexOf(ref),
				length: ref.length
			});
		}
	});

	test('FindDefinition malformed percent escapes', async function () {
		for (const key of ['%', '%GG', '%C3']) {
			const ref = `#/${key}`;
			const value = JSON.stringify({ [key]: 1, $ref: ref });
			await testFindLinksFor(value, { target: value.indexOf(':1') + 1, offset: value.indexOf(ref), length: ref.length });
			await testFindLinksFor(JSON.stringify({ $ref: ref }), null);
		}
	});

	test('FindDefinition anchor reference ($anchor)', async function () {
		// $anchor in $defs
		const schema1 = '{"$defs": {"foo": {"$anchor": "myAnchor", "type": "string"}}, "properties": {"x": {"$ref": "#myAnchor"}}}';
		// target: the object {"$anchor": "myAnchor", "type": "string"} starts at offset 18
		await testFindLinksFor(schema1, { target: 18, offset: 92, length: 9 });
	});

	test('FindDefinition anchor reference (legacy $id fragment)', async function () {
		// $id: "#foo" is a legacy anchor in draft-06/07
		const schema2 = '{"$defs": {"a": {"$id": "#legacyAnchor", "type": "number"}}, "properties": {"x": {"$ref": "#legacyAnchor"}}}';
		// target: the object {"$id": "#legacyAnchor", ...} starts at offset 16
		await testFindLinksFor(schema2, { target: 16, offset: 91, length: 13 });
	});

	test('FindDefinition embedded schema by $id', async function () {
		// $ref to an embedded schema URI matching a $id within the document
		const schema3 = '{"$defs": {"e": {"$id": "https://example.com/embedded", "type": "string"}}, "properties": {"x": {"$ref": "https://example.com/embedded"}}}';
		// target: the object {"$id": "https://example.com/embedded", ...} starts at offset 16
		await testFindLinksFor(schema3, { target: 16, offset: 106, length: 28 });
	});

	test('FindDefinition embedded schema not matching root', async function () {
		// $ref to a URI that only the root has should not match
		const schema4 = '{"$id": "https://example.com/root", "$defs": {"e": {"type": "string"}}, "properties": {"x": {"$ref": "https://example.com/root"}}}';
		await testFindLinksFor(schema4, null);
	});

	test('FindDefinition anchor reference not found', async function () {
		// $ref to a non-existing anchor
		await testFindLinksFor('{"$defs": {"foo": {"$anchor": "other"}}, "properties": {"x": {"$ref": "#missing"}}}', null);
	});
});
