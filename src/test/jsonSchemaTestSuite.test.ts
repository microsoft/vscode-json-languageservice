/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as Parser from '../parser/jsonParser';
import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';
import { getLanguageService, SchemaDraft, TextDocument } from '../jsonLanguageService';
import { URI } from 'vscode-uri';

const testsPath = path.join(__dirname, "../../../node_modules/json-schema-test-suite/tests");

const drafts = [
	'draft4', 'draft6', 'draft7', 'draft2019-09', 'draft2020-12'
];

export const schemaIds: { [id: string]: SchemaDraft } = {
	'draft4': SchemaDraft.v4,
	'draft6': SchemaDraft.v6,
	'draft7': SchemaDraft.v7,
	'draft2019-09': SchemaDraft.v2019_09,
	'draft2020-12': SchemaDraft.v2020_12
};

const workspaceContext = {
	resolveRelativePath: (relativePath: string, resource: string) => {
		return url.resolve(resource, relativePath);
	}
};

// Draft-06 metaschema for validating schemas against the draft-06 spec
const draft06MetaSchema = JSON.stringify({
	"$id": "http://json-schema.org/draft-06/schema#",
	"$schema": "http://json-schema.org/draft-06/schema#",
	"title": "Core schema meta-schema",
	"definitions": {
		"schemaArray": { "type": "array", "minItems": 1, "items": { "$ref": "#" } },
		"nonNegativeInteger": { "type": "integer", "minimum": 0 },
		"nonNegativeIntegerDefault0": { "allOf": [{ "$ref": "#/definitions/nonNegativeInteger" }, { "default": 0 }] },
		"simpleTypes": { "enum": ["array", "boolean", "integer", "null", "number", "object", "string"] },
		"stringArray": { "type": "array", "items": { "type": "string" }, "uniqueItems": true, "default": [] }
	},
	"type": ["object", "boolean"],
	"properties": {
		"$id": { "type": "string", "format": "uri-reference" },
		"$schema": { "type": "string", "format": "uri" },
		"$ref": { "type": "string", "format": "uri-reference" },
		"title": { "type": "string" },
		"description": { "type": "string" },
		"default": {},
		"examples": { "type": "array", "items": {} },
		"multipleOf": { "type": "number", "exclusiveMinimum": 0 },
		"maximum": { "type": "number" },
		"exclusiveMaximum": { "type": "number" },
		"minimum": { "type": "number" },
		"exclusiveMinimum": { "type": "number" },
		"maxLength": { "$ref": "#/definitions/nonNegativeInteger" },
		"minLength": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
		"pattern": { "type": "string", "format": "regex" },
		"additionalItems": { "$ref": "#" },
		"items": { "anyOf": [{ "$ref": "#" }, { "$ref": "#/definitions/schemaArray" }], "default": {} },
		"maxItems": { "$ref": "#/definitions/nonNegativeInteger" },
		"minItems": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
		"uniqueItems": { "type": "boolean", "default": false },
		"contains": { "$ref": "#" },
		"maxProperties": { "$ref": "#/definitions/nonNegativeInteger" },
		"minProperties": { "$ref": "#/definitions/nonNegativeIntegerDefault0" },
		"required": { "$ref": "#/definitions/stringArray" },
		"additionalProperties": { "$ref": "#" },
		"definitions": { "type": "object", "additionalProperties": { "$ref": "#" }, "default": {} },
		"properties": { "type": "object", "additionalProperties": { "$ref": "#" }, "default": {} },
		"patternProperties": { "type": "object", "additionalProperties": { "$ref": "#" }, "propertyNames": { "format": "regex" }, "default": {} },
		"dependencies": { "type": "object", "additionalProperties": { "anyOf": [{ "$ref": "#" }, { "$ref": "#/definitions/stringArray" }] } },
		"propertyNames": { "$ref": "#" },
		"const": {},
		"enum": { "type": "array", "minItems": 1, "uniqueItems": true },
		"type": { "anyOf": [{ "$ref": "#/definitions/simpleTypes" }, { "type": "array", "items": { "$ref": "#/definitions/simpleTypes" }, "minItems": 1, "uniqueItems": true }] },
		"format": { "type": "string" },
		"allOf": { "$ref": "#/definitions/schemaArray" },
		"anyOf": { "$ref": "#/definitions/schemaArray" },
		"oneOf": { "$ref": "#/definitions/schemaArray" },
		"not": { "$ref": "#" }
	},
	"default": {}
});

// Schema request service to load remote schemas from the test suite's remotes directory
const schemaRequestService = async (uri: string): Promise<string> => {
	// Handle localhost:1234 URLs by loading from remotes directory
	if (uri.startsWith('http://localhost:1234/')) {
		const remotePath = uri.replace('http://localhost:1234/', '');
		const remoteFilePath = path.join(__dirname, '../../../node_modules/json-schema-test-suite/remotes', remotePath);
		try {
			const content = fs.readFileSync(remoteFilePath, 'utf8');
			return content;
		} catch (e) {
			return `{ "error": "Failed to load remote schema: ${uri}" }`;
		}
	}
	// Handle draft-06 metaschema requests (normalizeId converts http:// to https:// and removes trailing #)
	if (uri === 'https://json-schema.org/draft-06/schema' || uri === 'http://json-schema.org/draft-06/schema#' || uri === 'http://json-schema.org/draft-06/schema') {
		return draft06MetaSchema;
	}
	// For other URLs, return empty schema
	return '{}';
};

const ls = getLanguageService({ workspaceContext, schemaRequestService });

// Map draft folder names to their $schema URIs
const draftSchemaUris: { [id: string]: string } = {
	'draft4': 'http://json-schema.org/draft-04/schema#',
	'draft6': 'http://json-schema.org/draft-06/schema#',
	'draft7': 'http://json-schema.org/draft-07/schema#',
	'draft2019-09': 'https://json-schema.org/draft/2019-09/schema',
	'draft2020-12': 'https://json-schema.org/draft/2020-12/schema'
};

async function assertSchemaValidation(input: any, schema: any, valid: boolean, description: string, draft: string, fileName: string) {
	const textDoc = TextDocument.create('foo://bar/file.json', 'json', 0, JSON.stringify(input));
	const jsonDoc = Parser.parse(textDoc);
	const schemaClone = JSON.parse(JSON.stringify(schema));

	// Inject $schema if not already present and schema is an object (not boolean), 
	// so schema resolution knows the draft version
	if (typeof schemaClone === 'object' && schemaClone !== null && !schemaClone.$schema && draftSchemaUris[draft]) {
		schemaClone.$schema = draftSchemaUris[draft];
	}

	assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
	const semanticErrors = await ls.doValidation(textDoc, jsonDoc, { schemaDraft: schemaIds[draft] }, Parser.asSchema(schemaClone));
	if (valid && semanticErrors.length > 0) {
		assert.deepStrictEqual([], semanticErrors, `\n${fileName}\n${description}: No error expected: ${JSON.stringify(input)} against ${JSON.stringify(schema)}`);
	} else if (!valid && semanticErrors.length === 0) {
		assert.fail(`\n${fileName}\n${description}: Expected error: ${JSON.stringify(input)} against ${JSON.stringify(schema)}`);
	}
}

const collectFailedTests = false;
const failedTests: string[] = [];

function initializeTests() {
	suite(`JSON Schema Test Suite`, () => {
		for (const draft of drafts) {
			const folderPath = path.resolve(testsPath, draft);
			const entries = fs.readdirSync(folderPath, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isFile() && entry.name.endsWith('json')) {
					const filePath = path.join(folderPath, entry.name);
					try {
						const testFileContent = JSON.parse((fs.readFileSync(filePath)).toString());
						if (Array.isArray(testFileContent)) {
							for (const testGroupEntry of testFileContent) {
								suite(`${draft} - ${testGroupEntry.description}`, () => {
									for (const testEntry of testGroupEntry.tests) {
										const id = `${draft}/${entry.name}/${testGroupEntry.description}/${testEntry.description}`;
										const fn = async () => {
											try {
												await assertSchemaValidation(testEntry.data, testGroupEntry.schema, testEntry.valid, testEntry.description, draft, URI.file(filePath).toString());
											} catch (e) {
												if (collectFailedTests) {
													failedTests.push(id);
												} else {
													throw e;
												}
											}
										};
										if (!collectFailedTests && skippedTests.has(id)) {
											test.skip(testEntry.description, fn);
										} else if (!collectFailedTests && skippedTests.has('_' + id)) {
											test.only(testEntry.description, fn);
										} else {
											test(testEntry.description, fn);
										}
									}
								});
							}
						}
					} catch (e) {
						console.log(e);
						assert.fail(`Problem parsing ${filePath}`);

					}
				}
			}
			suiteTeardown(() => {
				if (collectFailedTests) {
					fs.writeFileSync('failedTests.txt', failedTests.map(t => JSON.stringify(t)).join(',\n'));
				}
			});
		}


	});
}
const skippedTests = new Set([
	"draft2020-12/dynamicRef.json/A $dynamicRef to a $dynamicAnchor in the same schema resource should behave like a normal $ref to an $anchor/An array of strings is valid",
	"draft2020-12/dynamicRef.json/A $dynamicRef to an $anchor in the same schema resource should behave like a normal $ref to an $anchor/An array of strings is valid",
	"draft2020-12/dynamicRef.json/A $ref to a $dynamicAnchor in the same schema resource should behave like a normal $ref to an $anchor/An array of strings is valid",
	"draft2020-12/dynamicRef.json/A $dynamicRef should resolve to the first $dynamicAnchor still in scope that is encountered when the schema is evaluated/An array of strings is valid",
	"draft2020-12/dynamicRef.json/A $dynamicRef with intermediate scopes that don't include a matching $dynamicAnchor should not affect dynamic scope resolution/An array of strings is valid",
	"draft2020-12/dynamicRef.json/An $anchor with the same name as a $dynamicAnchor should not be used for dynamic scope resolution/Any array is valid",
	"draft2020-12/dynamicRef.json/A $dynamicRef without a matching $dynamicAnchor in the same schema resource should behave like a normal $ref to $anchor/Any array is valid",
	"draft2020-12/dynamicRef.json/A $dynamicRef with a non-matching $dynamicAnchor in the same schema resource should behave like a normal $ref to $anchor/Any array is valid",
	"draft2020-12/dynamicRef.json/A $dynamicRef that initially resolves to a schema with a matching $dynamicAnchor should resolve to the first $dynamicAnchor in the dynamic scope/The recursive part is valid against the root",
	"draft2020-12/dynamicRef.json/A $dynamicRef that initially resolves to a schema without a matching $dynamicAnchor should behave like a normal $ref to $anchor/The recursive part doesn't need to validate against the root",
	"draft2020-12/dynamicRef.json/multiple dynamic paths to the $dynamicRef keyword/recurse to anyLeafNode - floats are allowed",
	"draft2020-12/dynamicRef.json/after leaving a dynamic scope, it should not be used by a $dynamicRef//then/$defs/thingy is the final stop for the $dynamicRef",
	"draft2020-12/dynamicRef.json/strict-tree schema, guards against misspelled properties/instance with correct field",
	"draft2020-12/dynamicRef.json/tests for implementation dynamic anchor and reference link/correct extended schema",
	"draft2020-12/dynamicRef.json/Tests for implementation dynamic anchor and reference link. Reference should be independent of any possible ordering./correct extended schema",
	"draft2020-12/dynamicRef.json/Tests for implementation dynamic anchor and reference link. Reference should be independent of any possible ordering./correct extended schema",
]);
initializeTests();