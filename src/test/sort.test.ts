
import { getLanguageService, ClientCapabilities, TextDocument, FormattingOptions } from '../jsonLanguageService';
import * as assert from 'assert';

suite('Sort JSON', () => {

    const ls = getLanguageService({ clientCapabilities: ClientCapabilities.LATEST });
    let keepLinesFormattingOptions = { tabSize: 2, insertSpaces: true, keepLines: true, eol: '\n', insertFinalNewline: false };
    let notKeepLinesFormattingOptions = { tabSize: 2, insertSpaces: true, keepLines: false, eol: '\n', insertFinalNewline: false };

    function testSort(unsorted: string, expected: string, options: FormattingOptions) {
        let document = TextDocument.create('test://test.json', 'json', 0, unsorted);
        const sorted = ls.sort(document, options);
        console.log("At the very end : ", sorted);
        assert.equal(sorted, expected);
    }

    test('sorting a simple JSON object with numeric values', () => {
        var content = [
            '{"b" : 1, "a" : 2}'
        ].join('\n');

        var expectedKeepLines = [
            '{\n  "a": 2,\n  "b": 1\n}'
        ].join('\n');

        var expectedNotKeepLines = [
            '{\n  "a": 2,\n  "b": 1\n}'
        ].join('\n');

        testSort(content, expectedKeepLines, keepLinesFormattingOptions);
        testSort(content, expectedNotKeepLines, notKeepLinesFormattingOptions);
    });

    test('sorting a simple JSON object with an array spanning several lines', () => {
        var content = [
            '{"array":["volleyball",',
            '      "drawing",',
            '  "hiking"]}'
        ].join('\n');

        var expectedKeepLines = [
            '{',
            '  "array": [ "volleyball",',
            '    "drawing",',
            '    "hiking" ]',
            '}'
        ].join('\n');

        var expectedNotKeepLines = [
            '{',
            '  "array": [',
            '    "volleyball",',
            '    "drawing",',
            '    "hiking"',
            '  ]',
            '}'

        ].join('\n');

        testSort(content, expectedNotKeepLines, notKeepLinesFormattingOptions);
        testSort(content, expectedKeepLines, keepLinesFormattingOptions);
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

        var expectedKeepLines = [
            '{',
            '  "age": 30,',
            '  "friends": {',
            '    "Leila": {',
            '      "age": 32,',
            '      "hobbies": [ "watching movies",',
            '        "reading books" ]',
            '    },',
            '    "Marc": {',
            '      "age": 35,',
            '      "hobbies": [ "kayaking", "mountaineering" ]',
            '    }',
            '  },',
            '  "hobbies": [ "volleyball", "drawing", "hiking" ],',
            '  "name": "Brigitte"',
            '}'
        ].join('\n');

        var expectedNotKeepLines = [
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

        testSort(content, expectedNotKeepLines, notKeepLinesFormattingOptions);
        testSort(content, expectedKeepLines, keepLinesFormattingOptions);
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

        var expectedKeepLines = [
            '{ // this is a comment',
            '  "array": [',
            '    // this is a second comment',
            '    "element1", "element2" ],',
            '  "boolean": true',
            '}'

        ].join('\n');

        var expectedNotKeepLines = [
            '{ // this is a comment',
            '  "array": [',
            '    // this is a second comment',
            '    "element1",',
            '    "element2"',
            '  ],',
            '  "boolean": true',
            '}'
        ].join('\n');

        testSort(content, expectedNotKeepLines, notKeepLinesFormattingOptions);
        testSort(content, expectedKeepLines, keepLinesFormattingOptions);
    });

    test('sorting a JSON object with an object nested inside of an array value', () => {
        var content = [
            '{',
            '"boolean" : true,',
            '"array" : [',
            ' "element1", {"property" : "element2"}, "element3"]',
            '}'
        ].join('\n');

        var expectedKeepLines = [
            '{',
            '  "array": [',
            '    "element1", {',
            '      "property": "element2"',
            '    }, "element3" ],',
            '  "boolean": true',
            '}'
        ].join('\n');

        var expectedNotKeepLines = [
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

        testSort(content, expectedNotKeepLines, notKeepLinesFormattingOptions);
        testSort(content, expectedKeepLines, keepLinesFormattingOptions);
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

        var expectedKeepLines = [
            '// comment appearing before',
            '',
            '{',
            '  "array": [',
            '    "element1", {',
            '      "property": "element2"',
            '    }, "element3" ],',
            '  "boolean": true',
            '} /* block comment appearing ',
            'after, it spans several',
            'lines */'
        ].join('\n');

        var expectedNotKeepLines = [
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

        testSort(content, expectedNotKeepLines, notKeepLinesFormattingOptions);
        testSort(content, expectedKeepLines, keepLinesFormattingOptions);
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

        var expectedKeepLines = [
            '',
            '',
            '{',
            '  "array": [',
            '    "element1", {',
            '      "property": "element2"',
            '    }, "element3" ],',
            '  "boolean": true',
            '}',
            '',
            ''
        ].join('\n');

        var expectedNotKeepLines = [
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

        testSort(content, expectedNotKeepLines, notKeepLinesFormattingOptions);
        testSort(content, expectedKeepLines, keepLinesFormattingOptions);
    });

    // Try all of the test cases in the formatter.test.ts file and focus on these particular corner cases
    // 1. block comment after a comma but ending not on the same line as the comma
    // 2. new property starting on the same line as the end of a block comment
    // 3. colon index not on the same line as the property value followed by the value
    // 4. colon index not on the same line as the proeprty value and not on the same line as the value itself either
    // 5. new lines (more than one) between two properties
    // 6. property value followed by a line comment followed by a block comment (on several lines) on the same line
    // 7. sorting a JSON object with comments appearing between a value and its comma
});
