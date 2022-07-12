/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as SchemaService from '../services/jsonSchemaService';
import * as Parser from '../parser/jsonParser';
import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';
import { getLanguageService, JSONSchema, SchemaRequestService, TextDocument, MatchingSchema } from '../jsonLanguageService';

const testsPath = path.join(__dirname, "../../../node_modules/json-schema-test-suite/tests");

// const drafts = [
//     'draft4', 'draft6', 'draft7', 'draft2019-09', 'draft2020-12'
// ];
const drafts = [
    'draft4'
];

const workspaceContext = {
    resolveRelativePath: (relativePath: string, resource: string) => {
        return url.resolve(resource, relativePath);
    }
};
const ls = getLanguageService({ workspaceContext });

async function assertSchemaValidation(input: any, schema: any, valid: boolean, description: string) {
    const textDoc = TextDocument.create('foo://bar/file.json', 'json', 0, JSON.stringify(input));
    const jsonDoc = Parser.parse(textDoc);

    assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
    const semanticErrors = await ls.doValidation(textDoc, jsonDoc, {}, schema);
    if (valid && semanticErrors.length > 0) {
        assert.deepStrictEqual([], semanticErrors, `No error expected for '${description}': ${JSON.stringify(input)} against ${JSON.stringify(schema)}`);
    } else if (!valid && semanticErrors.length === 0) {
        assert.fail(`Expected error for '${description}': ${JSON.stringify(input)} against ${JSON.stringify(schema)}`);
    }
}


for (const draft of drafts) {
    suite.only(`JSON Schema Test Suite - ${draft}`, () => {
        const folderPath = path.resolve(testsPath, draft);
        const entries = fs.readdirSync(folderPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('json')) {
                const filePath = path.join(folderPath, entry.name);
                try {
                    const testFileContent = JSON.parse((fs.readFileSync(filePath)).toString());
                    if (Array.isArray(testFileContent)) {
                        suite(entry.name, () => {
                            for (const testGroupEntry of testFileContent) {
                                test(testGroupEntry.description, async () => {
                                    for (const testEntry of testGroupEntry.tests) {
                                        //test(testEntry.description, async () => {
                                        const schema = JSON.parse(JSON.stringify(testGroupEntry.schema));
                                        await assertSchemaValidation(testEntry.data, schema, testEntry.valid, testEntry.description);
                                        //});
                                    }
                                });
                            }
                        });
                    }
                } catch (e) {
                    //assert.fail(`Problem parsing ${filePath}`);
                }
            }
        }
    });
}