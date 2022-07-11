/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as SchemaService from '../services/jsonSchemaService';
import * as Parser from '../parser/jsonParser';
import { promises as fs } from 'fs';
import * as url from 'url';
import * as path from 'path';
import { getLanguageService, JSONSchema, SchemaRequestService, TextDocument, MatchingSchema } from '../jsonLanguageService';
import { DiagnosticSeverity, SchemaConfiguration } from '../jsonLanguageTypes';


const testsPath = path.join("../../node_modules/json-schema-test-suite/tests");

const drafts = [
    'draft4', 'draft6', 'draft7', 'draft2019-09', 'draft2020-12'
]

function assertSchemaValidation(input: any, schema: any, valid: boolean) {
    
}



suite('JSON Schema Test Suite', () => {
    const workspaceContext = {
		resolveRelativePath: (relativePath: string, resource: string) => {
			return url.resolve(resource, relativePath);
		}
	};
    const ls = getLanguageService({ workspaceContext });

    for (const draft of drafts) {
        suite(draft, async () => {
            const entries = await fs.readdir(path.join(testsPath, draft), { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('json')) {
                    const filePath = path.join(testsPath, draft, entry.name);
                    try {
                        const testFileContent = JSON.parse((await fs.readFile(filePath)).toString());
                        if (Array.isArray(testFileContent)) {
                            for (const testGroupEntry of testFileContent) {
                                test(testGroupEntry.description, () => {
                                    for (const testEntry of testGroupEntry.tests) {
                                        const schema =  JSON.parse(JSON.stringify(testGroupEntry.schema));
                                        ls.doValidation()
                                    }



                                }



                        }


                    } catch (e) {
                        fail(`Problem parsing ${filePath}`);
                    }
                    
                }
            }


    }


}