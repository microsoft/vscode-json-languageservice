
import { getLanguageService, ClientCapabilities, TextDocument, FormattingOptions } from '../jsonLanguageService';
import * as assert from 'assert';

suite('Sort JSON', () => {

	const ls = getLanguageService({ clientCapabilities: ClientCapabilities.LATEST });

    let options = { tabSize: 2, insertSpaces: true, keepLines : false, eol : '\n', insertFinalNewline : false};
    
    function sort(unsorted: string, expected: string, options: FormattingOptions) {
        let document = TextDocument.create('test://test.json', 'json', 0, unsorted);
        const sorted = ls.sort(document, options);
        assert.equal(sorted, expected);
    }

	test.only('sorting simple JSON object without array', () => {
		var content = [
			'{"b" : 1, "a" : 2}'
		].join('\n');

        var expected = [
			'{\n  "a": 2,\n  "b": 1\n}'
		].join('\n');

		sort(content, expected, options);
	});

    
    test.only('sorting simple JSON object while keeping and not keeping new lines inside nested array', () => {

        var content = [
            '{"array":',
            '["volleyball"',
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

        sort(content, expected, options);
    });

    test.only('sorting complex JSON object while keeping and not keeping new lines inside nested array', () => {

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

        sort(content, expected, options);
    });

    
    test.only('sorting JSON object with comments', () => {

        var content = [
            '{ // this is a comment',
            '"boolean" : true',
            '"array" : [',
            '// this is a second comment',
            ' "element1", "element2"]',
            '}' 
        ].join('\n');

        var expected = [
            '{',
            '  "array": [',
            '    "element1",',
            '    "element2"',
            '  ],',
            '  "boolean": true',
            '}' 
        ].join('\n');

        sort(content, expected, options);
    });
});