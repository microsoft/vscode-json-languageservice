
import { getLanguageService, ClientCapabilities, TextDocument, FormattingOptions } from '../jsonLanguageService';
import * as assert from 'assert';

suite('Sort JSON', () => {

    const ls = getLanguageService({ clientCapabilities: ClientCapabilities.LATEST });
    let formattingOptions = { tabSize: 2, insertSpaces: true, keepLines: false, eol: '\n', insertFinalNewline: false };

    function testSort(unsorted: string, expected: string, options: FormattingOptions) {
        let document = TextDocument.create('test://test.json', 'json', 0, unsorted);
        const sorted = ls.sort(document, options);
        console.log('sorted : ', sorted)
        assert.equal(sorted, expected);
    }

    test('sorting a simple JSON object with numeric values', () => {
        var content = [
            '{"b" : 1, "a" : 2}'
        ].join('\n');

        var expected = [
            '{\n  "a": 2,\n  "b": 1\n}'
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a simple JSON object with an array spanning several lines', () => {
        var content = [
            '{"array":["volleyball",',
            '      "drawing",',
            '  "hiking"]}'
        ].join('\n');

        var expected = [
            '{',
            '  "array": [',
            '    "volleyball",',
            '    "drawing",',
            '    "hiking"',
            '  ]',
            '}'

        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a JSON object with nested objects', () => {
        var content = [
            '{"name": "Brigitte","age" : 30,',
            '"hobbies" : ["volleyball","drawing","hiking"],',
            '"friends" : {',
            '"Marc" : {"hobbies" : ["kayaking", "mountaineering"],',
            '"age" : 35},',
            '"Leila" : {"hobbies" : ["watching movies",',
            '"reading books"], "age" : 32}}}'
        ].join('\n');

        var expected = [
            '{',
            '  "age": 30,',
            '  "friends": {',
            '    "Leila": {',
            '      "age": 32,',
            '      "hobbies": [',
            '        "watching movies",',
            '        "reading books"',
            '      ]',
            '    },',
            '    "Marc": {',
            '      "age": 35,',
            '      "hobbies": [',
            '        "kayaking",',
            '        "mountaineering"',
            '      ]',
            '    }',
            '  },',
            '  "hobbies": [',
            '    "volleyball",',
            '    "drawing",',
            '    "hiking"',
            '  ],',
            '  "name": "Brigitte"',
            '}'
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a JSON object with line comments', () => {
        var content = [
            '{ // this is a comment',
            '"boolean" : true,',
            '"array" : [',
            '// this is a second comment',
            ' "element1", "element2"]',
            '}'

        ].join('\n');

        var expected = [
            '{ // this is a comment',
            '  "array": [',
            '    // this is a second comment',
            '    "element1",',
            '    "element2"',
            '  ],',
            '  "boolean": true',
            '}'
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a JSON object with an object nested inside of an array value', () => {
        var content = [
            '{',
            '"boolean" : true,',
            '"array" : [',
            ' "element1", {"property" : "element2"}, "element3"]',
            '}'
        ].join('\n');

        var expected = [
            '{',
            '  "array": [',
            '    "element1",',
            '    {',
            '      "property": "element2"',
            '    },',
            '    "element3"',
            '  ],',
            '  "boolean": true',
            '}'
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a JSON object with comments appearing before and after the main JSON object', () => {
        var content = [
            '// comment appearing before',
            '',
            '{',
            '"boolean" : true,',
            '"array" : [',
            ' "element1", {"property" : "element2"}, "element3"]',
            '} /* block comment appearing ',
            'after, it spans several',
            'lines */'
        ].join('\n');

        var expected = [
            '// comment appearing before',
            '{',
            '  "array": [',
            '    "element1",',
            '    {',
            '      "property": "element2"',
            '    },',
            '    "element3"',
            '  ],',
            '  "boolean": true',
            '} /* block comment appearing ',
            'after, it spans several',
            'lines */'
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a JSON object with new lines appearing before and after the main JSON object', () => {
        var content = [
            '',
            '',
            '{',
            '"boolean" : true,',
            '"array" : [',
            ' "element1", {"property" : "element2"}, "element3"]',
            '}',
            '',
            ''
        ].join('\n');

        var expected = [
            '{',
            '  "array": [',
            '    "element1",',
            '    {',
            '      "property": "element2"',
            '    },',
            '    "element3"',
            '  ],',
            '  "boolean": true',
            '}',
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a JSON object with a block comment appearing on the same line as a comma but not ending on that line', () => {
        var content = [
            '{',
            '"boolean" : true, /* this is block comment starting on',
            'the line where the comma is but ending on another line */',
            '"array" : []',
            '}',
        ].join('\n');

        var expected = [
            '{',
            '  "array": [],',
            '  "boolean": true /* this is block comment starting on',
            'the line where the comma is but ending on another line */',
            '}',
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a JSON object with a block comment starting at the end of a property and such that a new property starts on the end of that block comment', () => {
        var content = [
            '{',
            '"boolean" : true, /* this is block comment starting on',
            'the line where the comma is but ending on another line */ "array" : []',
            '}',
        ].join('\n');

        var expected = [
            '{',
            '  "array": [],',
            '  "boolean": true /* this is block comment starting on',
            'the line where the comma is but ending on another line */',
            '}',
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a JSON object with comments between properties', () => {
        var content = [
            '// comment appearing before',
            '',
            '{',
            ' // some comment',
            '"boolean" : true,',
            ' // some other comment',
            '"numeric" : 2,',
            ' /* a third comment',
            ' which is a block comment */',
            '"array": []',
            '}'
        ].join('\n');

        var expected = [
            '// comment appearing before',
            '{',
            '  /* a third comment',
            ' which is a block comment */',
            '  "array": [],',
            '  // some comment',
            '  "boolean": true,',
            '  // some other comment',
            '  "numeric": 2',
            '}'
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a JSON object with comments appearing between a value and the comma', () => {
        var content = [
            '{',
            '"boolean" : true // some comment',
            ',',
            '"array" : [],',
            '"numeric" : 2',
            '}'
        ].join('\n');

        var expected = [
            '{',
            '  "array": [],',
            '  "boolean": true // some comment',
            '  ,',
            '  "numeric": 2',
            '}'
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a JSON object where the colon is not on the same line as the key or the value', () => {
        var content = [
            '{',
            '"boolean"',
            ':', 
            'true // some comment',
            ',',
            '"array"',
            ': [],',
            '"numeric" : 2',
            '}'
        ].join('\n');

        var expected = [
            '{',
            '  "array": [],',
            '  "boolean": true // some comment',
            '  ,',
            '  "numeric": 2',
            '}'
        ].join('\n');

        testSort(content, expected, formattingOptions);
    });

    test('sorting a more complicated JSON object', () => {
        var content = [
            '// Comment ouside the main JSON object',
            '',
            '{',
            '// A comment which belongs to b',
            '"b": "some value",',
            '',
            '"a": "some other value" /* a block comment which starts on the same line as key a',
            '..*/,',
            '',
            '"array": [',
            '"first element",',
            '{',
            '    // comment belonging to r',
            '    "r" : 1,',
            '',
            '    // comment belonging to q',
            '    "q" : {',
            '        "s" : 2',
            '    },',
            '    // comment belonging to p',
            '    "p" : 3',
            '},',
            '"third element"',
            '] // some comment on the line where the array ends',
            ',',
            '',
            '"numeric" : [ 1, 2, 3]',
            '}',
            '',
            '',
            '/* Comment below the main JSON object',
            '...',
            '...',
            '*/'
        ].join('\n');

        var expected = [
            '// Comment ouside the main JSON object',
            '{',
            '  "a": "some other value" /* a block comment which starts on the same line as key a',
            '..*/,',
            '  "array": [',
            '    "first element",',
            '    {',
            '      // comment belonging to p',
            '      "p": 3,',
            '      // comment belonging to q',
            '      "q": {',
            '        "s": 2',
            '      },',
            '      // comment belonging to r',
            '      "r": 1',
            '    },',
            '    "third element"',
            '  ] // some comment on the line where the array ends',
            '  ,',
            '  // A comment which belongs to b',
            '  "b": "some value",',
            '  "numeric": [',
            '    1,',
            '    2,',
            '    3',
            '  ]',
            '}',
            '/* Comment below the main JSON object',
            '...',
            '...',
            '*/'
        ].join('\n');
        
        testSort(content, expected, formattingOptions);
    })
});
