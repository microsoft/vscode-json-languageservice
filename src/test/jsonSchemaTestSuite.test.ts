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
const ls = getLanguageService({ workspaceContext });

async function assertSchemaValidation(input: any, schema: any, valid: boolean, description: string, draft: string, fileName: string) {
	const textDoc = TextDocument.create('foo://bar/file.json', 'json', 0, JSON.stringify(input));
	const jsonDoc = Parser.parse(textDoc);
	const schemaClone = JSON.parse(JSON.stringify(schema));

	assert.strictEqual(jsonDoc.syntaxErrors.length, 0);
	const semanticErrors = await ls.doValidation(textDoc, jsonDoc, { schemaDraft: schemaIds[draft] }, schemaClone);
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
										const id = `${draft}/${entry.name}/${testEntry.description}`;
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
					console.log(failedTests.map(t => JSON.stringify(t)).join(',\n'));
				}
			});
		}


	});
}
const skippedTests = new Set([
	"draft4/id.json/exact match to enum, and type matches",
	"draft4/id.json/match $ref to id",
	"draft4/patternProperties.json/an invalid due to the other is invalid",
	"draft4/properties.json/patternProperty invalidates property",
	"draft4/ref.json/ref valid, maxItems ignored",
	"draft4/ref.json/$ref resolves to /definitions/base_foo, data validates",
	"draft4/ref.json/valid tree",
	"draft4/ref.json/match",
	"draft4/ref.json/number should pass",
	"draft4/refRemote.json/remote ref valid",
	"draft4/refRemote.json/remote fragment valid",
	"draft4/refRemote.json/ref within ref valid",
	"draft4/refRemote.json/base URI change ref valid",
	"draft4/refRemote.json/number is valid",
	"draft4/refRemote.json/number is valid",
	"draft4/refRemote.json/string is valid",
	"draft4/refRemote.json/null is valid",
	"draft4/refRemote.json/integer is valid",
	"draft4/uniqueItems.json/non-unique array of objects is invalid",
	"draft4/uniqueItems.json/non-unique array of nested objects is invalid",
	"draft4/uniqueItems.json/non-unique array of arrays is invalid",
	"draft4/uniqueItems.json/non-unique array of more than two arrays is invalid",
	"draft4/uniqueItems.json/non-unique heterogeneous types are invalid",
	"draft4/uniqueItems.json/objects are non-unique despite key order",
	"draft6/boolean_schema.json/number is invalid",
	"draft6/boolean_schema.json/string is invalid",
	"draft6/boolean_schema.json/boolean true is invalid",
	"draft6/boolean_schema.json/boolean false is invalid",
	"draft6/boolean_schema.json/null is invalid",
	"draft6/boolean_schema.json/object is invalid",
	"draft6/boolean_schema.json/empty object is invalid",
	"draft6/boolean_schema.json/array is invalid",
	"draft6/boolean_schema.json/empty array is invalid",
	"draft6/definitions.json/valid definition schema",
	"draft6/id.json/exact match to enum, and type matches",
	"draft6/id.json/match $ref to id",
	"draft6/patternProperties.json/an invalid due to the other is invalid",
	"draft6/patternProperties.json/object with a property matching both true and false is invalid",
	"draft6/properties.json/patternProperty invalidates property",
	"draft6/ref.json/ref valid, maxItems ignored",
	"draft6/ref.json/$ref resolves to /definitions/base_foo, data validates",
	"draft6/ref.json/remote ref valid",
	"draft6/ref.json/valid tree",
	"draft6/ref.json/match",
	"draft6/ref.json/valid on both fields",
	"draft6/ref.json/valid on both fields",
	"draft6/refRemote.json/remote ref valid",
	"draft6/refRemote.json/remote fragment valid",
	"draft6/refRemote.json/ref within ref valid",
	"draft6/refRemote.json/base URI change ref valid",
	"draft6/refRemote.json/number is valid",
	"draft6/refRemote.json/number is valid",
	"draft6/refRemote.json/string is valid",
	"draft6/refRemote.json/null is valid",
	"draft6/refRemote.json/valid",
	"draft6/refRemote.json/integer is valid",
	"draft6/uniqueItems.json/non-unique array of objects is invalid",
	"draft6/uniqueItems.json/non-unique array of nested objects is invalid",
	"draft6/uniqueItems.json/non-unique array of arrays is invalid",
	"draft6/uniqueItems.json/non-unique array of more than two arrays is invalid",
	"draft6/uniqueItems.json/non-unique heterogeneous types are invalid",
	"draft6/uniqueItems.json/objects are non-unique despite key order",
	"draft6/unknownKeyword.json/type matches second anyOf, which has a real schema in it",
	"draft7/boolean_schema.json/number is invalid",
	"draft7/boolean_schema.json/string is invalid",
	"draft7/boolean_schema.json/boolean true is invalid",
	"draft7/boolean_schema.json/boolean false is invalid",
	"draft7/boolean_schema.json/null is invalid",
	"draft7/boolean_schema.json/object is invalid",
	"draft7/boolean_schema.json/empty object is invalid",
	"draft7/boolean_schema.json/array is invalid",
	"draft7/boolean_schema.json/empty array is invalid",
	"draft7/id.json/exact match to enum, and type matches",
	"draft7/id.json/match $ref to id",
	"draft7/patternProperties.json/an invalid due to the other is invalid",
	"draft7/patternProperties.json/object with a property matching both true and false is invalid",
	"draft7/properties.json/patternProperty invalidates property",
	"draft7/ref.json/ref valid, maxItems ignored",
	"draft7/ref.json/$ref resolves to /definitions/base_foo, data validates",
	"draft7/ref.json/valid tree",
	"draft7/ref.json/match",
	"draft7/ref.json/valid on both fields",
	"draft7/ref.json/valid on both fields",
	"draft7/ref.json/number should pass",
	"draft7/refRemote.json/remote ref valid",
	"draft7/refRemote.json/remote fragment valid",
	"draft7/refRemote.json/ref within ref valid",
	"draft7/refRemote.json/base URI change ref valid",
	"draft7/refRemote.json/number is valid",
	"draft7/refRemote.json/number is valid",
	"draft7/refRemote.json/string is valid",
	"draft7/refRemote.json/null is valid",
	"draft7/refRemote.json/valid",
	"draft7/refRemote.json/integer is valid",
	"draft7/uniqueItems.json/non-unique array of objects is invalid",
	"draft7/uniqueItems.json/non-unique array of nested objects is invalid",
	"draft7/uniqueItems.json/non-unique array of arrays is invalid",
	"draft7/uniqueItems.json/non-unique array of more than two arrays is invalid",
	"draft7/uniqueItems.json/non-unique heterogeneous types are invalid",
	"draft7/uniqueItems.json/objects are non-unique despite key order",
	"draft7/unknownKeyword.json/type matches second anyOf, which has a real schema in it",
	"draft2019-09/anchor.json/match",
	"draft2019-09/anchor.json/match",
	"draft2019-09/anchor.json/$ref should resolve to /$defs/A/allOf/1",
	"draft2019-09/boolean_schema.json/number is invalid",
	"draft2019-09/boolean_schema.json/string is invalid",
	"draft2019-09/boolean_schema.json/boolean true is invalid",
	"draft2019-09/boolean_schema.json/boolean false is invalid",
	"draft2019-09/boolean_schema.json/null is invalid",
	"draft2019-09/boolean_schema.json/object is invalid",
	"draft2019-09/boolean_schema.json/empty object is invalid",
	"draft2019-09/boolean_schema.json/array is invalid",
	"draft2019-09/boolean_schema.json/empty array is invalid",
	"draft2019-09/defs.json/valid definition schema",
	"draft2019-09/dependentSchemas.json/object with property having schema false is invalid",
	"draft2019-09/dependentSchemas.json/object with both properties is invalid",
	"draft2019-09/id.json/Identifier name with absolute URI",
	"draft2019-09/id.json/Identifier name with base URI change in subschema",
	"draft2019-09/id.json/Unnormalized identifier",
	"draft2019-09/id.json/Unnormalized identifier and no ref",
	"draft2019-09/id.json/Unnormalized identifier with empty fragment",
	"draft2019-09/id.json/Unnormalized identifier with empty fragment and no ref",
	"draft2019-09/id.json/exact match to enum, and type matches",
	"draft2019-09/id.json/match $ref to $id",
	"draft2019-09/patternProperties.json/an invalid due to the other is invalid",
	"draft2019-09/patternProperties.json/object with a property matching both true and false is invalid",
	"draft2019-09/properties.json/patternProperty invalidates property",
	"draft2019-09/recursiveRef.json/match",
	"draft2019-09/recursiveRef.json/recursive match",
	"draft2019-09/recursiveRef.json/integer matches at the outer level",
	"draft2019-09/recursiveRef.json/single level match",
	"draft2019-09/recursiveRef.json/two levels, properties match with inner definition",
	"draft2019-09/recursiveRef.json/integer matches at the outer level",
	"draft2019-09/recursiveRef.json/single level match",
	"draft2019-09/recursiveRef.json/integer now matches as a property value",
	"draft2019-09/recursiveRef.json/two levels, properties match with inner definition",
	"draft2019-09/recursiveRef.json/two levels, properties match with $recursiveRef",
	"draft2019-09/recursiveRef.json/integer matches at the outer level",
	"draft2019-09/recursiveRef.json/single level match",
	"draft2019-09/recursiveRef.json/two levels, properties match with inner definition",
	"draft2019-09/recursiveRef.json/integer matches at the outer level",
	"draft2019-09/recursiveRef.json/single level match",
	"draft2019-09/recursiveRef.json/two levels, properties match with inner definition",
	"draft2019-09/recursiveRef.json/leaf node matches: recursion uses the inner schema",
	"draft2019-09/recursiveRef.json/leaf node matches: recursion only uses inner schema",
	"draft2019-09/recursiveRef.json/recurse to anyLeafNode - floats are allowed",
	"draft2019-09/recursiveRef.json/numeric node",
	"draft2019-09/ref.json/remote ref valid",
	"draft2019-09/ref.json/valid tree",
	"draft2019-09/ref.json/referenced subschema doesn't see annotations from properties",
	"draft2019-09/ref.json/valid on both fields",
	"draft2019-09/ref.json/valid on both fields",
	"draft2019-09/ref.json/number should pass",
	"draft2019-09/ref.json/data is valid against first definition",
	"draft2019-09/ref.json/data is valid against first definition",
	"draft2019-09/refRemote.json/remote ref valid",
	"draft2019-09/refRemote.json/remote fragment valid",
	"draft2019-09/refRemote.json/ref within ref valid",
	"draft2019-09/refRemote.json/base URI change ref valid",
	"draft2019-09/refRemote.json/number is valid",
	"draft2019-09/refRemote.json/number is valid",
	"draft2019-09/refRemote.json/string is valid",
	"draft2019-09/refRemote.json/null is valid",
	"draft2019-09/refRemote.json/valid",
	"draft2019-09/refRemote.json/integer is valid",
	"draft2019-09/unevaluatedProperties.json/with additional properties",
	"draft2019-09/unevaluatedProperties.json/with additional properties",
	"draft2019-09/unevaluatedProperties.json/with nested unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/when if is false and has unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/when if is false and has unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/with no unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/with no unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/always fails",
	"draft2019-09/unevaluatedProperties.json/with nested unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/with nested unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/with no nested unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/all is valid",
	"draft2019-09/unevaluatedProperties.json/all + foo is valid",
	"draft2019-09/uniqueItems.json/non-unique array of objects is invalid",
	"draft2019-09/uniqueItems.json/non-unique array of nested objects is invalid",
	"draft2019-09/uniqueItems.json/non-unique array of arrays is invalid",
	"draft2019-09/uniqueItems.json/non-unique array of more than two arrays is invalid",
	"draft2019-09/uniqueItems.json/non-unique heterogeneous types are invalid",
	"draft2019-09/uniqueItems.json/objects are non-unique despite key order",
	"draft2019-09/unknownKeyword.json/type matches second anyOf, which has a real schema in it",
	"draft2019-09/vocabulary.json/no validation: invalid number, but it still validates",
	"draft2020-12/anchor.json/match",
	"draft2020-12/anchor.json/match",
	"draft2020-12/anchor.json/$ref should resolve to /$defs/A/allOf/1",
	"draft2020-12/boolean_schema.json/number is invalid",
	"draft2020-12/boolean_schema.json/string is invalid",
	"draft2020-12/boolean_schema.json/boolean true is invalid",
	"draft2020-12/boolean_schema.json/boolean false is invalid",
	"draft2020-12/boolean_schema.json/null is invalid",
	"draft2020-12/boolean_schema.json/object is invalid",
	"draft2020-12/boolean_schema.json/empty object is invalid",
	"draft2020-12/boolean_schema.json/array is invalid",
	"draft2020-12/boolean_schema.json/empty array is invalid",
	"draft2020-12/defs.json/valid definition schema",
	"draft2020-12/dependentSchemas.json/object with property having schema false is invalid",
	"draft2020-12/dependentSchemas.json/object with both properties is invalid",
	"draft2020-12/dynamicRef.json/An array of strings is valid",
	"draft2020-12/dynamicRef.json/An array of strings is valid",
	"draft2020-12/dynamicRef.json/An array of strings is valid",
	"draft2020-12/dynamicRef.json/An array of strings is valid",
	"draft2020-12/dynamicRef.json/An array of strings is valid",
	"draft2020-12/dynamicRef.json/Any array is valid",
	"draft2020-12/dynamicRef.json/Any array is valid",
	"draft2020-12/dynamicRef.json/Any array is valid",
	"draft2020-12/dynamicRef.json/The recursive part is valid against the root",
	"draft2020-12/dynamicRef.json/The recursive part doesn't need to validate against the root",
	"draft2020-12/dynamicRef.json/recurse to anyLeafNode - floats are allowed",
	"draft2020-12/dynamicRef.json//then/$defs/thingy is the final stop for the $dynamicRef",
	"draft2020-12/dynamicRef.json/instance with correct field",
	"draft2020-12/dynamicRef.json/correct extended schema",
	"draft2020-12/dynamicRef.json/correct extended schema",
	"draft2020-12/dynamicRef.json/correct extended schema",
	"draft2020-12/id.json/Identifier name with absolute URI",
	"draft2020-12/id.json/Identifier name with base URI change in subschema",
	"draft2020-12/id.json/Unnormalized identifier",
	"draft2020-12/id.json/Unnormalized identifier and no ref",
	"draft2020-12/id.json/Unnormalized identifier with empty fragment",
	"draft2020-12/id.json/Unnormalized identifier with empty fragment and no ref",
	"draft2020-12/id.json/exact match to enum, and type matches",
	"draft2020-12/id.json/match $ref to $id",
	"draft2020-12/patternProperties.json/an invalid due to the other is invalid",
	"draft2020-12/patternProperties.json/object with a property matching both true and false is invalid",
	"draft2020-12/properties.json/patternProperty invalidates property",
	"draft2020-12/ref.json/remote ref valid",
	"draft2020-12/ref.json/valid tree",
	"draft2020-12/ref.json/referenced subschema doesn't see annotations from properties",
	"draft2020-12/ref.json/valid on both fields",
	"draft2020-12/ref.json/valid on both fields",
	"draft2020-12/ref.json/number should pass",
	"draft2020-12/ref.json/data is valid against first definition",
	"draft2020-12/ref.json/data is valid against first definition",
	"draft2020-12/refRemote.json/remote ref valid",
	"draft2020-12/refRemote.json/remote fragment valid",
	"draft2020-12/refRemote.json/ref within ref valid",
	"draft2020-12/refRemote.json/base URI change ref valid",
	"draft2020-12/refRemote.json/number is valid",
	"draft2020-12/refRemote.json/number is valid",
	"draft2020-12/refRemote.json/string is valid",
	"draft2020-12/refRemote.json/null is valid",
	"draft2020-12/refRemote.json/valid",
	"draft2020-12/refRemote.json/integer is valid",
	"draft2020-12/unevaluatedProperties.json/with additional properties",
	"draft2020-12/unevaluatedProperties.json/with additional properties",
	"draft2020-12/unevaluatedProperties.json/with nested unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/when if is false and has unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/when if is false and has unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/with no unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/with no unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/always fails",
	"draft2020-12/unevaluatedProperties.json/with nested unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/with nested unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/with no nested unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/all is valid",
	"draft2020-12/unevaluatedProperties.json/all + foo is valid",
	"draft2020-12/uniqueItems.json/non-unique array of objects is invalid",
	"draft2020-12/uniqueItems.json/non-unique array of nested objects is invalid",
	"draft2020-12/uniqueItems.json/non-unique array of arrays is invalid",
	"draft2020-12/uniqueItems.json/non-unique array of more than two arrays is invalid",
	"draft2020-12/uniqueItems.json/non-unique heterogeneous types are invalid",
	"draft2020-12/uniqueItems.json/objects are non-unique despite key order",
	"draft2020-12/unknownKeyword.json/type matches second anyOf, which has a real schema in it",
	"draft2020-12/vocabulary.json/no validation: invalid number, but it still validates"
]);
initializeTests();