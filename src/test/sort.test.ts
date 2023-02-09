
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

    test('sorting a complicated JSON object 1', () => {
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

    test('sorting a complicated JSON object 2', () => {
        var content = [
            '/*', 
            '',
            'adding some comment before the actual JSON file',
            '',
            '*/ {',
            '    "webviewContentExternalBaseUrlTemplate": "https://{{uuid}}.vscode-cdn.net/insider/ef65ac1ba57f57f2a3961bfe94aa20481caca4c6/out/vs/workbench/contrib/webview/browser/pre/",',
            '    // some other comment',
            '    "builtInExtensions": [',
            '        {',
            '            "name": "ms-vscode.js-debug-companion", /** adding some more comments **/',
            '            "version": "1.0.18",',
            '            "repo": "https://github.com/microsoft/vscode-js-debug-companion",',
            '            "metadata": {',
            '                "id": "99cb0b7f-7354-4278-b8da-6cc79972169d",',
            '                "publisherId": {',
            '                    "publisherId": "5f5636e7-69ed-4afe-b5d6-8d231fb3d3ee",',
            '                    "publisherName": "ms-vscode" // comment',
            '                    ,',
            '                    "displayName": "Microsoft",',
            '                    "flags": "verified"',
            '                },',
            '                "publisherDisplayName": "Microsoft"',
            '            }',
            '        },',
            '        {',
            '            "name": "ms-vscode.js-debug", /** adding some more comments',
            '            ...',
            '            ...',
            '            */ "version": "1.75.1",',
            '            "repo": "https://github.com/microsoft/vscode-js-debug",',
            '            "metadata": {',
            '                "id": "25629058-ddac-4e17-abba-74678e126c5d",',
            '                "publisherId": {',
            '                    "publisherId": "5f5636e7-69ed-4afe-b5d6-8d231fb3d3ee",',
            '                    "publisherName": "ms-vscode",',
            '                    "displayName": "Microsoft",',
            '                    "flags": "verified"',
            '                },',
            '                "publisherDisplayName": "Microsoft"',
            '            }',
            '           // some more comments at the end after all properties',
            '        },',
            '        {',
            '            "name": "ms-vscode.vscode-js-profile-table",',
            '            "version": "1.0.3",',
            '            "repo": "https://github.com/microsoft/vscode-js-profile-visualizer",',
            '            "metadata": {',
            '                "id": "7e52b41b-71ad-457b-ab7e-0620f1fc4feb",',
            '                "publisherId": {',
            '                    "publisherId": "5f5636e7-69ed-4afe-b5d6-8d231fb3d3ee",',
            '                    "publisherName": "ms-vscode",',
            '                    "displayName": "Microsoft",',
            '                    "flags": "verified"',
            '                },',
            '                "publisherDisplayName": "Microsoft"',
            '            }',
            '        } ',
            '    ] // comment on the end of an array',
            '}',
        ].join('\n');

        var expected = [
            '/*', 
            '',
            'adding some comment before the actual JSON file',
            '',
            '*/ {',
            '  // some other comment',
            '  "builtInExtensions": [',
            '    {',
            '      "metadata": {',
            '        "id": "99cb0b7f-7354-4278-b8da-6cc79972169d",',
            '        "publisherDisplayName": "Microsoft",',
            '        "publisherId": {',
            '          "displayName": "Microsoft",',
            '          "flags": "verified",',
            '          "publisherId": "5f5636e7-69ed-4afe-b5d6-8d231fb3d3ee",',
            '          "publisherName": "ms-vscode" // comment',
            '        }',
            '      },',
            '      "name": "ms-vscode.js-debug-companion", /** adding some more comments **/',
            '      "repo": "https://github.com/microsoft/vscode-js-debug-companion",',
            '      "version": "1.0.18"',
            '    },',
            '    {',
            '      "metadata": {',
            '        "id": "25629058-ddac-4e17-abba-74678e126c5d",',
            '        "publisherDisplayName": "Microsoft",',
            '        "publisherId": {',
            '          "displayName": "Microsoft",',
            '          "flags": "verified",',
            '          "publisherId": "5f5636e7-69ed-4afe-b5d6-8d231fb3d3ee",',
            '          "publisherName": "ms-vscode"',
            '        }',
            '      },',
            '      // some more comments at the end after all properties',
            '      "name": "ms-vscode.js-debug", /** adding some more comments',
            '            ...',
            '            ...',
            '            */',
            '      "repo": "https://github.com/microsoft/vscode-js-debug",',
            '      "version": "1.75.1"',
            '    },',
            '    {',
            '      "metadata": {',
            '        "id": "7e52b41b-71ad-457b-ab7e-0620f1fc4feb",',
            '        "publisherDisplayName": "Microsoft",',
            '        "publisherId": {',
            '          "displayName": "Microsoft",',
            '          "flags": "verified",',
            '          "publisherId": "5f5636e7-69ed-4afe-b5d6-8d231fb3d3ee",',
            '          "publisherName": "ms-vscode"',
            '        }',
            '      },',
            '      "name": "ms-vscode.vscode-js-profile-table",',
            '      "repo": "https://github.com/microsoft/vscode-js-profile-visualizer",',
            '      "version": "1.0.3"',
            '    }',
            '  ], // comment on the end of an array',
            '  "webviewContentExternalBaseUrlTemplate": "https://{{uuid}}.vscode-cdn.net/insider/ef65ac1ba57f57f2a3961bfe94aa20481caca4c6/out/vs/workbench/contrib/webview/browser/pre/"',
            '}',
        ].join('\n');
        
        testSort(content, expected, formattingOptions);
    })
});
