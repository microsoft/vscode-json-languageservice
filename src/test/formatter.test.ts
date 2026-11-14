/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getLanguageService, ClientCapabilities, Range, TextDocument, FormattingOptions } from '../jsonLanguageService.js';
import * as assert from 'assert';
import { suite, test } from 'node:test';

const applyEdits = TextDocument.applyEdits;

suite('JSON Formatter', () => {

	const ls = getLanguageService({ clientCapabilities: ClientCapabilities.LATEST });

	function format(unformatted: string, expected: string, insertSpaces = true) {
		let range: Range | undefined = undefined;
		const uri = 'test://test.json';

		const rangeStart = unformatted.indexOf('|');
		const rangeEnd = unformatted.lastIndexOf('|');
		if (rangeStart !== -1 && rangeEnd !== -1) {
			// remove '|'
			unformatted = unformatted.substring(0, rangeStart) + unformatted.substring(rangeStart + 1, rangeEnd) + unformatted.substring(rangeEnd + 1);
			const unformattedDoc = TextDocument.create(uri, 'json', 0, unformatted);
			const startPos = unformattedDoc.positionAt(rangeStart);
			const endPos = unformattedDoc.positionAt(rangeEnd);
			range = Range.create(startPos, endPos);
		}

		const document = TextDocument.create(uri, 'json', 0, unformatted);
		const edits = ls.format(document, range, { tabSize: 2, insertSpaces: insertSpaces });
		const formatted = applyEdits(document, edits);
		assert.equal(formatted, expected);
	}

	test('object - single property', () => {
		const content = [
			'{"x" : 1}'
		].join('\n');

		const expected = [
			'{',
			'  "x": 1',
			'}'
		].join('\n');

		format(content, expected);
	});
	test('object - multiple properties', () => {
		const content = [
			'{"x" : 1,  "y" : "foo", "z"  : true}'
		].join('\n');

		const expected = [
			'{',
			'  "x": 1,',
			'  "y": "foo",',
			'  "z": true',
			'}'
		].join('\n');

		format(content, expected);
	});
	test('object - no properties ', () => {
		const content = [
			'{"x" : {    },  "y" : {}}'
		].join('\n');

		const expected = [
			'{',
			'  "x": {},',
			'  "y": {}',
			'}'
		].join('\n');

		format(content, expected);
	});
	test('object - nesting', () => {
		const content = [
			'{"x" : {  "y" : { "z"  : { }}, "a": true}}'
		].join('\n');

		const expected = [
			'{',
			'  "x": {',
			'    "y": {',
			'      "z": {}',
			'    },',
			'    "a": true',
			'  }',
			'}'
		].join('\n');

		format(content, expected);
	});

	test('array - single items', () => {
		const content = [
			'["[]"]'
		].join('\n');

		const expected = [
			'[',
			'  "[]"',
			']'
		].join('\n');

		format(content, expected);
	});

	test('array - multiple items', () => {
		const content = [
			'[true,null,1.2]'
		].join('\n');

		const expected = [
			'[',
			'  true,',
			'  null,',
			'  1.2',
			']'
		].join('\n');

		format(content, expected);
	});

	test('array - no items', () => {
		const content = [
			'[      ]'
		].join('\n');

		const expected = [
			'[]'
		].join('\n');

		format(content, expected);
	});

	test('array - nesting', () => {
		const content = [
			'[ [], [ [ {} ], "a" ]  ]'
		].join('\n');

		const expected = [
			'[',
			'  [],',
			'  [',
			'    [',
			'      {}',
			'    ],',
			'    "a"',
			'  ]',
			']',
		].join('\n');

		format(content, expected);
	});

	test('syntax errors', () => {
		const content = [
			'[ null  1.2 "Hello" ]'
		].join('\n');

		const expected = [
			'[',
			'  null  1.2 "Hello"',
			']',
		].join('\n');

		format(content, expected);
	});

	test('syntax errors 2', () => {
		const content = [
			'{"a":"b""c":"d" }'
		].join('\n');

		const expected = [
			'{',
			'  "a": "b""c": "d"',
			'}',
		].join('\n');

		format(content, expected);
	});

	test('empty lines', () => {
		const content = [
			'{',
			'"a": true,',
			'',
			'"b": true',
			'}',
		].join('\n');

		const expected = [
			'{',
			'\t"a": true,',
			'\t"b": true',
			'}',
		].join('\n');

		format(content, expected, false);
	});
	test('single line comment', () => {
		const content = [
			'[ ',
			'//comment',
			'"foo", "bar"',
			'] '
		].join('\n');

		const expected = [
			'[',
			'  //comment',
			'  "foo",',
			'  "bar"',
			']',
		].join('\n');

		format(content, expected);
	});
	test('block line comment', () => {
		const content = [
			'[{',
			'        /*comment*/     ',
			'"foo" : true',
			'}] '
		].join('\n');

		const expected = [
			'[',
			'  {',
			'    /*comment*/',
			'    "foo": true',
			'  }',
			']',
		].join('\n');

		format(content, expected);
	});
	test('single line comment on same line', () => {
		const content = [
			' {  ',
			'        "a": {}// comment    ',
			' } '
		].join('\n');

		const expected = [
			'{',
			'  "a": {} // comment    ',
			'}',
		].join('\n');

		format(content, expected);
	});
	test('single line comment on same line 2', () => {
		const content = [
			'{ //comment',
			'}'
		].join('\n');

		const expected = [
			'{ //comment',
			'}'
		].join('\n');

		format(content, expected);
	});
	test('block comment on same line', () => {
		const content = [
			'{      "a": {}, /*comment*/    ',
			'        /*comment*/ "b": {},    ',
			'        "c": {/*comment*/}    } ',
		].join('\n');

		const expected = [
			'{',
			'  "a": {}, /*comment*/',
			'  /*comment*/ "b": {},',
			'  "c": { /*comment*/}',
			'}',
		].join('\n');

		format(content, expected);
	});

	test('block comment on same line advanced', () => {
		const content = [
			' {       "d": [',
			'             null',
			'        ] /*comment*/',
			'        ,"e": /*comment*/ [null] }',
		].join('\n');

		const expected = [
			'{',
			'  "d": [',
			'    null',
			'  ] /*comment*/,',
			'  "e": /*comment*/ [',
			'    null',
			'  ]',
			'}',
		].join('\n');

		format(content, expected);
	});

	test('multiple block comments on same line', () => {
		const content = [
			'{      "a": {} /*comment*/, /*comment*/   ',
			'        /*comment*/ "b": {}  /*comment*/  } '
		].join('\n');

		const expected = [
			'{',
			'  "a": {} /*comment*/, /*comment*/',
			'  /*comment*/ "b": {} /*comment*/',
			'}',
		].join('\n');

		format(content, expected);
	});

	test('multiple mixed comments on same line', () => {
		const content = [
			'[ /*comment*/  /*comment*/   // comment ',
			']'
		].join('\n');

		const expected = [
			'[ /*comment*/ /*comment*/ // comment ',
			']'
		].join('\n');

		format(content, expected);
	});

	test('range', () => {
		const content = [
			'{ "a": {},',
			'|"b": [null, null]|',
			'} '
		].join('\n');

		const expected = [
			'{ "a": {},',
			'"b": [',
			'  null,',
			'  null',
			']',
			'} ',
		].join('\n');

		format(content, expected);
	});

	test('range with existing indent', () => {
		const content = [
			'{ "a": {},',
			'   |"b": [null],',
			'"c": {}',
			'}|'
		].join('\n');

		const expected = [
			'{ "a": {},',
			'   "b": [',
			'    null',
			'  ],',
			'  "c": {}',
			'}',
		].join('\n');

		format(content, expected);
	});


	test('range with existing indent - tabs', () => {
		const content = [
			'{ "a": {},',
			'|  "b": [null],   ',
			'"c": {}',
			'}|    '
		].join('\n');

		const expected = [
			'{ "a": {},',
			'\t"b": [',
			'\t\tnull',
			'\t],',
			'\t"c": {}',
			'}',
		].join('\n');

		format(content, expected, false);
	});

	test('property range - issue 14623', () => {
		const content = [
			'{ |"a" :| 1,',
			'  "b": 1',
			'}'
		].join('\n');

		const expected = [
			'{ "a": 1,',
			'  "b": 1',
			'}'
		].join('\n');

		format(content, expected, false);
	});
	test('block comment none-line breaking symbols', () => {
		const content = [
			'{ "a": [ 1',
			'/* comment */',
			', 2',
			'/* comment */',
			']',
			'/* comment */',
			',',
			' "b": true',
			'/* comment */',
			'}'
		].join('\n');

		const expected = [
			'{',
			'  "a": [',
			'    1',
			'    /* comment */',
			'    ,',
			'    2',
			'    /* comment */',
			'  ]',
			'  /* comment */',
			'  ,',
			'  "b": true',
			'  /* comment */',
			'}',
		].join('\n');

		format(content, expected);
	});
	test('line comment after none-line breaking symbols', () => {
		const content = [
			'{ "a":',
			'// comment',
			'null,',
			' "b"',
			'// comment',
			': null',
			'// comment',
			'}'
		].join('\n');

		const expected = [
			'{',
			'  "a":',
			'  // comment',
			'  null,',
			'  "b"',
			'  // comment',
			'  : null',
			'  // comment',
			'}',
		].join('\n');

		format(content, expected);
	});
	test('random content', () => {
		const content = [
			'a 1 b 1 3 true'
		].join('\n');

		const expected = [
			'a 1 b 1 3 true',
		].join('\n');

		format(content, expected);
	});
});
suite('JSON Formatter - compact', () => {

	const ls = getLanguageService({ clientCapabilities: ClientCapabilities.LATEST });

	function format(unformatted: string, expected: string, options: Partial<FormattingOptions> = {}) {
		let range: Range | undefined = undefined;
		const uri = 'test://test.json';

		const rangeStart = unformatted.indexOf('|');
		const rangeEnd = unformatted.lastIndexOf('|');
		if (rangeStart !== -1 && rangeEnd !== -1) {
			unformatted = unformatted.substring(0, rangeStart) + unformatted.substring(rangeStart + 1, rangeEnd) + unformatted.substring(rangeEnd + 1);
			const unformattedDoc = TextDocument.create(uri, 'json', 0, unformatted);
			range = Range.create(unformattedDoc.positionAt(rangeStart), unformattedDoc.positionAt(rangeEnd));
		}

		const document = TextDocument.create(uri, 'json', 0, unformatted);
		const formattingOptions: FormattingOptions = { tabSize: 2, insertSpaces: true, compact: true, ...options };
		const edits = ls.format(document, range, formattingOptions);
		const formatted = applyEdits(document, edits);
		assert.equal(formatted, expected);

		if (!range) {
			// formatting the result again must not change anything
			const formattedDocument = TextDocument.create(uri, 'json', 0, formatted);
			assert.deepEqual(ls.format(formattedDocument, undefined, formattingOptions), []);
		}
	}

	test('containers with a single entry stay on one line', () => {
		const content = '{"name":"JSON","patterns":[{"include":"#value"}],"repository":{"array":{"begin":"[","beginCaptures":{"0":{"name":"punctuation.definition.array.begin.json"}},"patterns":[{"include":"#value"},{"match":",","name":"punctuation.separator.array.json"}]}}}';

		const expected = [
			'{',
			'  "name": "JSON",',
			'  "patterns": [ { "include": "#value" } ],',
			'  "repository": {',
			'    "array": {',
			'      "begin": "[",',
			'      "beginCaptures": { "0": { "name": "punctuation.definition.array.begin.json" } },',
			'      "patterns": [',
			'        { "include": "#value" },',
			'        {',
			'          "match": ",",',
			'          "name": "punctuation.separator.array.json"',
			'        }',
			'      ]',
			'    }',
			'  }',
			'}'
		].join('\n');

		format(content, expected);
	});

	test('single entry root and nested chains', () => {
		format('{"a":{"b":{"c":[1]}}}', '{ "a": { "b": { "c": [ 1 ] } } }');
		format('[ "x" ]', '[ "x" ]');
		format('{"a":{},"b":[ ],"c":[[]]}', [
			'{',
			'  "a": {},',
			'  "b": [],',
			'  "c": [ [] ]',
			'}'
		].join('\n'));
	});

	test('single entry container with a multi entry child is expanded', () => {
		const expected = [
			'{',
			'  "a": {',
			'    "b": 1,',
			'    "c": [ true ]',
			'  }',
			'}'
		].join('\n');
		format('{"a":{"b":1,"c":[true]}}', expected);
	});

	test('maxLineLength', () => {
		const content = '{"a":{"bb":{"cc":"0123456789"}},"d":1}';
		// '  "a": { "bb": { "cc": "0123456789" } },' has 40 characters
		format(content, [
			'{',
			'  "a": { "bb": { "cc": "0123456789" } },',
			'  "d": 1',
			'}'
		].join('\n'), { maxLineLength: 40 });
		format(content, [
			'{',
			'  "a": {',
			'    "bb": { "cc": "0123456789" }',
			'  },',
			'  "d": 1',
			'}'
		].join('\n'), { maxLineLength: 39 });
		format(content, [
			'{',
			'  "a": {',
			'    "bb": {',
			'      "cc": "0123456789"',
			'    }',
			'  },',
			'  "d": 1',
			'}'
		].join('\n'), { maxLineLength: 10 });
	});

	test('maxLineLength counts tabs as tabSize', () => {
		const content = '{"a":{"b":1},"c":2}';
		// '\t"a": { "b": 1 },' is 20 characters wide with a tab size of 4
		format(content, '{\n\t"a": { "b": 1 },\n\t"c": 2\n}', { insertSpaces: false, tabSize: 4, maxLineLength: 20 });
		format(content, '{\n\t"a": {\n\t\t"b": 1\n\t},\n\t"c": 2\n}', { insertSpaces: false, tabSize: 4, maxLineLength: 19 });
	});

	test('containers with comments or trailing commas stay expanded', () => {
		format('{"a":{"b":1 /* c */},"d":[1,]}', [
			'{',
			'  "a": {',
			'    "b": 1 /* c */',
			'  },',
			'  "d": [',
			'    1,',
			'  ]',
			'}'
		].join('\n'));
		format('{"a":{\n// c\n"b":1}}', [
			'{',
			'  "a": {',
			'    // c',
			'    "b": 1',
			'  }',
			'}'
		].join('\n'));
	});

	test('invalid content', () => {
		format('{"a":{"b":}', [
			'{',
			'  "a": {',
			'    "b":',
			'  }'
		].join('\n'));
	});

	test('range', () => {
		const content = [
			'{',
			'  "a": {',
			'    "x": 1',
			'  },',
			'|  "b": {"y" :2},|',
			'  "c": {',
			'    "z": 3',
			'  }',
			'}'
		].join('\n');

		const expected = [
			'{',
			'  "a": {',
			'    "x": 1',
			'  },',
			'  "b": { "y": 2 },',
			'  "c": {',
			'    "z": 3',
			'  }',
			'}'
		].join('\n');

		format(content, expected);
	});

	test('compact is ignored with keepLines', () => {
		for (const content of ['{"a":{"b":1}}', '{\n"a":{\n"b":1}}', '{\n"a":[\n1]\n}']) {
			const document = TextDocument.create('test://test.json', 'json', 0, content);
			const options = { tabSize: 2, insertSpaces: true, keepLines: true };
			assert.deepEqual(ls.format(document, undefined, { ...options, compact: true }), ls.format(document, undefined, options));
		}
	});

	test('produces minimal edits', () => {
		const document = TextDocument.create('test://test.json', 'json', 0, '{\n  "a": {\n    "b": 1\n  },\n  "c": 2\n}');
		const edits = ls.format(document, undefined, { tabSize: 2, insertSpaces: true, compact: true });
		assert.deepEqual(edits.map(e => e.newText), [' ', ' ']);
		assert.equal(applyEdits(document, edits), '{\n  "a": { "b": 1 },\n  "c": 2\n}');
	});
});
