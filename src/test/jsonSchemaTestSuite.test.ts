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
	"draft4/id.json/id inside an enum is not a real identifier/exact match to enum, and type matches",
	"draft4/id.json/id inside an enum is not a real identifier/match $ref to id",
	"draft4/patternProperties.json/multiple simultaneous patternProperties are validated/an invalid due to the other is invalid",
	"draft4/properties.json/properties, patternProperties, additionalProperties interaction/patternProperty invalidates property",
	"draft4/ref.json/ref overrides any sibling keywords/ref valid, maxItems ignored",
	"draft4/ref.json/$ref prevents a sibling id from changing the base uri/$ref resolves to /definitions/base_foo, data validates",
	"draft4/ref.json/Recursive references between schemas/valid tree",
	"draft4/ref.json/Location-independent identifier with base URI change in subschema/match",
	"draft4/ref.json/id must be resolved against nearest parent, not just immediate parent/number should pass",
	"draft4/refRemote.json/remote ref/remote ref valid",
	"draft4/refRemote.json/fragment within remote ref/remote fragment valid",
	"draft4/refRemote.json/ref within remote ref/ref within ref valid",
	"draft4/refRemote.json/base URI change/base URI change ref valid",
	"draft4/refRemote.json/base URI change - change folder/number is valid",
	"draft4/refRemote.json/base URI change - change folder in subschema/number is valid",
	"draft4/refRemote.json/root ref in remote ref/string is valid",
	"draft4/refRemote.json/root ref in remote ref/null is valid",
	"draft4/refRemote.json/Location-independent identifier in remote ref/integer is valid",
	"draft4/uniqueItems.json/uniqueItems validation/non-unique array of objects is invalid",
	"draft4/uniqueItems.json/uniqueItems validation/non-unique array of nested objects is invalid",
	"draft4/uniqueItems.json/uniqueItems validation/non-unique array of arrays is invalid",
	"draft4/uniqueItems.json/uniqueItems validation/non-unique array of more than two arrays is invalid",
	"draft4/uniqueItems.json/uniqueItems validation/non-unique heterogeneous types are invalid",
	"draft4/uniqueItems.json/uniqueItems validation/objects are non-unique despite key order",
	"draft6/boolean_schema.json/boolean schema 'false'/number is invalid",
	"draft6/boolean_schema.json/boolean schema 'false'/string is invalid",
	"draft6/boolean_schema.json/boolean schema 'false'/boolean true is invalid",
	"draft6/boolean_schema.json/boolean schema 'false'/boolean false is invalid",
	"draft6/boolean_schema.json/boolean schema 'false'/null is invalid",
	"draft6/boolean_schema.json/boolean schema 'false'/object is invalid",
	"draft6/boolean_schema.json/boolean schema 'false'/empty object is invalid",
	"draft6/boolean_schema.json/boolean schema 'false'/array is invalid",
	"draft6/boolean_schema.json/boolean schema 'false'/empty array is invalid",
	"draft6/definitions.json/validate definition against metaschema/valid definition schema",
	"draft6/id.json/id inside an enum is not a real identifier/exact match to enum, and type matches",
	"draft6/id.json/id inside an enum is not a real identifier/match $ref to id",
	"draft6/patternProperties.json/multiple simultaneous patternProperties are validated/an invalid due to the other is invalid",
	"draft6/patternProperties.json/patternProperties with boolean schemas/object with a property matching both true and false is invalid",
	"draft6/properties.json/properties, patternProperties, additionalProperties interaction/patternProperty invalidates property",
	"draft6/ref.json/ref overrides any sibling keywords/ref valid, maxItems ignored",
	"draft6/ref.json/$ref prevents a sibling $id from changing the base uri/$ref resolves to /definitions/base_foo, data validates",
	"draft6/ref.json/remote ref, containing refs itself/remote ref valid",
	"draft6/ref.json/Recursive references between schemas/valid tree",
	"draft6/ref.json/Location-independent identifier with base URI change in subschema/match",
	"draft6/ref.json/refs with relative uris and defs/valid on both fields",
	"draft6/ref.json/relative refs with absolute uris and defs/valid on both fields",
	"draft6/refRemote.json/remote ref/remote ref valid",
	"draft6/refRemote.json/fragment within remote ref/remote fragment valid",
	"draft6/refRemote.json/ref within remote ref/ref within ref valid",
	"draft6/refRemote.json/base URI change/base URI change ref valid",
	"draft6/refRemote.json/base URI change - change folder/number is valid",
	"draft6/refRemote.json/base URI change - change folder in subschema/number is valid",
	"draft6/refRemote.json/root ref in remote ref/string is valid",
	"draft6/refRemote.json/root ref in remote ref/null is valid",
	"draft6/refRemote.json/remote ref with ref to definitions/valid",
	"draft6/refRemote.json/Location-independent identifier in remote ref/integer is valid",
	"draft6/uniqueItems.json/uniqueItems validation/non-unique array of objects is invalid",
	"draft6/uniqueItems.json/uniqueItems validation/non-unique array of nested objects is invalid",
	"draft6/uniqueItems.json/uniqueItems validation/non-unique array of arrays is invalid",
	"draft6/uniqueItems.json/uniqueItems validation/non-unique array of more than two arrays is invalid",
	"draft6/uniqueItems.json/uniqueItems validation/non-unique heterogeneous types are invalid",
	"draft6/uniqueItems.json/uniqueItems validation/objects are non-unique despite key order",
	"draft6/unknownKeyword.json/$id inside an unknown keyword is not a real identifier/type matches second anyOf, which has a real schema in it",
	"draft7/boolean_schema.json/boolean schema 'false'/number is invalid",
	"draft7/boolean_schema.json/boolean schema 'false'/string is invalid",
	"draft7/boolean_schema.json/boolean schema 'false'/boolean true is invalid",
	"draft7/boolean_schema.json/boolean schema 'false'/boolean false is invalid",
	"draft7/boolean_schema.json/boolean schema 'false'/null is invalid",
	"draft7/boolean_schema.json/boolean schema 'false'/object is invalid",
	"draft7/boolean_schema.json/boolean schema 'false'/empty object is invalid",
	"draft7/boolean_schema.json/boolean schema 'false'/array is invalid",
	"draft7/boolean_schema.json/boolean schema 'false'/empty array is invalid",
	"draft7/id.json/id inside an enum is not a real identifier/exact match to enum, and type matches",
	"draft7/id.json/id inside an enum is not a real identifier/match $ref to id",
	"draft7/patternProperties.json/multiple simultaneous patternProperties are validated/an invalid due to the other is invalid",
	"draft7/patternProperties.json/patternProperties with boolean schemas/object with a property matching both true and false is invalid",
	"draft7/properties.json/properties, patternProperties, additionalProperties interaction/patternProperty invalidates property",
	"draft7/ref.json/ref overrides any sibling keywords/ref valid, maxItems ignored",
	"draft7/ref.json/$ref prevents a sibling $id from changing the base uri/$ref resolves to /definitions/base_foo, data validates",
	"draft7/ref.json/Recursive references between schemas/valid tree",
	"draft7/ref.json/Location-independent identifier with base URI change in subschema/match",
	"draft7/ref.json/refs with relative uris and defs/valid on both fields",
	"draft7/ref.json/relative refs with absolute uris and defs/valid on both fields",
	"draft7/ref.json/$id must be resolved against nearest parent, not just immediate parent/number should pass",
	"draft7/refRemote.json/remote ref/remote ref valid",
	"draft7/refRemote.json/fragment within remote ref/remote fragment valid",
	"draft7/refRemote.json/ref within remote ref/ref within ref valid",
	"draft7/refRemote.json/base URI change/base URI change ref valid",
	"draft7/refRemote.json/base URI change - change folder/number is valid",
	"draft7/refRemote.json/base URI change - change folder in subschema/number is valid",
	"draft7/refRemote.json/root ref in remote ref/string is valid",
	"draft7/refRemote.json/root ref in remote ref/null is valid",
	"draft7/refRemote.json/remote ref with ref to definitions/valid",
	"draft7/refRemote.json/Location-independent identifier in remote ref/integer is valid",
	"draft7/uniqueItems.json/uniqueItems validation/non-unique array of objects is invalid",
	"draft7/uniqueItems.json/uniqueItems validation/non-unique array of nested objects is invalid",
	"draft7/uniqueItems.json/uniqueItems validation/non-unique array of arrays is invalid",
	"draft7/uniqueItems.json/uniqueItems validation/non-unique array of more than two arrays is invalid",
	"draft7/uniqueItems.json/uniqueItems validation/non-unique heterogeneous types are invalid",
	"draft7/uniqueItems.json/uniqueItems validation/objects are non-unique despite key order",
	"draft7/unknownKeyword.json/$id inside an unknown keyword is not a real identifier/type matches second anyOf, which has a real schema in it",
	"draft2019-09/anchor.json/Location-independent identifier with absolute URI/match",
	"draft2019-09/anchor.json/Location-independent identifier with base URI change in subschema/match",
	"draft2019-09/anchor.json/same $anchor with different base uri/$ref should resolve to /$defs/A/allOf/1",
	"draft2019-09/boolean_schema.json/boolean schema 'false'/number is invalid",
	"draft2019-09/boolean_schema.json/boolean schema 'false'/string is invalid",
	"draft2019-09/boolean_schema.json/boolean schema 'false'/boolean true is invalid",
	"draft2019-09/boolean_schema.json/boolean schema 'false'/boolean false is invalid",
	"draft2019-09/boolean_schema.json/boolean schema 'false'/null is invalid",
	"draft2019-09/boolean_schema.json/boolean schema 'false'/object is invalid",
	"draft2019-09/boolean_schema.json/boolean schema 'false'/empty object is invalid",
	"draft2019-09/boolean_schema.json/boolean schema 'false'/array is invalid",
	"draft2019-09/boolean_schema.json/boolean schema 'false'/empty array is invalid",
	"draft2019-09/defs.json/validate definition against metaschema/valid definition schema",
	"draft2019-09/dependentSchemas.json/boolean subschemas/object with property having schema false is invalid",
	"draft2019-09/dependentSchemas.json/boolean subschemas/object with both properties is invalid",
	"draft2019-09/id.json/Valid use of empty fragments in location-independent $id/Identifier name with absolute URI",
	"draft2019-09/id.json/Valid use of empty fragments in location-independent $id/Identifier name with base URI change in subschema",
	"draft2019-09/id.json/Unnormalized $ids are allowed but discouraged/Unnormalized identifier",
	"draft2019-09/id.json/Unnormalized $ids are allowed but discouraged/Unnormalized identifier and no ref",
	"draft2019-09/id.json/Unnormalized $ids are allowed but discouraged/Unnormalized identifier with empty fragment",
	"draft2019-09/id.json/Unnormalized $ids are allowed but discouraged/Unnormalized identifier with empty fragment and no ref",
	"draft2019-09/id.json/$id inside an enum is not a real identifier/exact match to enum, and type matches",
	"draft2019-09/id.json/$id inside an enum is not a real identifier/match $ref to $id",
	"draft2019-09/patternProperties.json/multiple simultaneous patternProperties are validated/an invalid due to the other is invalid",
	"draft2019-09/patternProperties.json/patternProperties with boolean schemas/object with a property matching both true and false is invalid",
	"draft2019-09/properties.json/properties, patternProperties, additionalProperties interaction/patternProperty invalidates property",
	"draft2019-09/recursiveRef.json/$recursiveRef without $recursiveAnchor works like $ref/match",
	"draft2019-09/recursiveRef.json/$recursiveRef without $recursiveAnchor works like $ref/recursive match",
	"draft2019-09/recursiveRef.json/$recursiveRef without using nesting/integer matches at the outer level",
	"draft2019-09/recursiveRef.json/$recursiveRef without using nesting/single level match",
	"draft2019-09/recursiveRef.json/$recursiveRef without using nesting/two levels, properties match with inner definition",
	"draft2019-09/recursiveRef.json/$recursiveRef with nesting/integer matches at the outer level",
	"draft2019-09/recursiveRef.json/$recursiveRef with nesting/single level match",
	"draft2019-09/recursiveRef.json/$recursiveRef with nesting/integer now matches as a property value",
	"draft2019-09/recursiveRef.json/$recursiveRef with nesting/two levels, properties match with inner definition",
	"draft2019-09/recursiveRef.json/$recursiveRef with nesting/two levels, properties match with $recursiveRef",
	"draft2019-09/recursiveRef.json/$recursiveRef with $recursiveAnchor: false works like $ref/integer matches at the outer level",
	"draft2019-09/recursiveRef.json/$recursiveRef with $recursiveAnchor: false works like $ref/single level match",
	"draft2019-09/recursiveRef.json/$recursiveRef with $recursiveAnchor: false works like $ref/two levels, properties match with inner definition",
	"draft2019-09/recursiveRef.json/$recursiveRef with no $recursiveAnchor works like $ref/integer matches at the outer level",
	"draft2019-09/recursiveRef.json/$recursiveRef with no $recursiveAnchor works like $ref/single level match",
	"draft2019-09/recursiveRef.json/$recursiveRef with no $recursiveAnchor works like $ref/two levels, properties match with inner definition",
	"draft2019-09/recursiveRef.json/$recursiveRef with no $recursiveAnchor in the initial target schema resource/leaf node matches: recursion uses the inner schema",
	"draft2019-09/recursiveRef.json/$recursiveRef with no $recursiveAnchor in the outer schema resource/leaf node matches: recursion only uses inner schema",
	"draft2019-09/recursiveRef.json/multiple dynamic paths to the $recursiveRef keyword/recurse to anyLeafNode - floats are allowed",
	"draft2019-09/recursiveRef.json/dynamic $recursiveRef destination (not predictable at schema compile time)/numeric node",
	"draft2019-09/ref.json/remote ref, containing refs itself/remote ref valid",
	"draft2019-09/ref.json/Recursive references between schemas/valid tree",
	"draft2019-09/ref.json/ref creates new scope when adjacent to keywords/referenced subschema doesn't see annotations from properties",
	"draft2019-09/ref.json/refs with relative uris and defs/valid on both fields",
	"draft2019-09/ref.json/relative refs with absolute uris and defs/valid on both fields",
	"draft2019-09/ref.json/$id must be resolved against nearest parent, not just immediate parent/number should pass",
	"draft2019-09/ref.json/order of evaluation: $id and $ref/data is valid against first definition",
	"draft2019-09/ref.json/order of evaluation: $id and $anchor and $ref/data is valid against first definition",
	"draft2019-09/refRemote.json/remote ref/remote ref valid",
	"draft2019-09/refRemote.json/fragment within remote ref/remote fragment valid",
	"draft2019-09/refRemote.json/ref within remote ref/ref within ref valid",
	"draft2019-09/refRemote.json/base URI change/base URI change ref valid",
	"draft2019-09/refRemote.json/base URI change - change folder/number is valid",
	"draft2019-09/refRemote.json/base URI change - change folder in subschema/number is valid",
	"draft2019-09/refRemote.json/root ref in remote ref/string is valid",
	"draft2019-09/refRemote.json/root ref in remote ref/null is valid",
	"draft2019-09/refRemote.json/remote ref with ref to defs/valid",
	"draft2019-09/refRemote.json/Location-independent identifier in remote ref/integer is valid",
	"draft2019-09/unevaluatedProperties.json/unevaluatedProperties with if/then/else/when if is false and has unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/unevaluatedProperties with if/then/else, then not defined/when if is false and has unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/unevaluatedProperties with dependentSchemas/with no unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/unevaluatedProperties with $ref/with no unevaluated properties",
	"draft2019-09/unevaluatedProperties.json/dynamic evalation inside nested refs/all is valid",
	"draft2019-09/unevaluatedProperties.json/dynamic evalation inside nested refs/all + foo is valid",
	"draft2019-09/uniqueItems.json/uniqueItems validation/non-unique array of objects is invalid",
	"draft2019-09/uniqueItems.json/uniqueItems validation/non-unique array of nested objects is invalid",
	"draft2019-09/uniqueItems.json/uniqueItems validation/non-unique array of arrays is invalid",
	"draft2019-09/uniqueItems.json/uniqueItems validation/non-unique array of more than two arrays is invalid",
	"draft2019-09/uniqueItems.json/uniqueItems validation/non-unique heterogeneous types are invalid",
	"draft2019-09/uniqueItems.json/uniqueItems validation/objects are non-unique despite key order",
	"draft2019-09/unknownKeyword.json/$id inside an unknown keyword is not a real identifier/type matches second anyOf, which has a real schema in it",
	"draft2019-09/vocabulary.json/schema that uses custom metaschema with with no validation vocabulary/no validation: invalid number, but it still validates",
	"draft2020-12/anchor.json/Location-independent identifier with absolute URI/match",
	"draft2020-12/anchor.json/Location-independent identifier with base URI change in subschema/match",
	"draft2020-12/anchor.json/same $anchor with different base uri/$ref should resolve to /$defs/A/allOf/1",
	"draft2020-12/boolean_schema.json/boolean schema 'false'/number is invalid",
	"draft2020-12/boolean_schema.json/boolean schema 'false'/string is invalid",
	"draft2020-12/boolean_schema.json/boolean schema 'false'/boolean true is invalid",
	"draft2020-12/boolean_schema.json/boolean schema 'false'/boolean false is invalid",
	"draft2020-12/boolean_schema.json/boolean schema 'false'/null is invalid",
	"draft2020-12/boolean_schema.json/boolean schema 'false'/object is invalid",
	"draft2020-12/boolean_schema.json/boolean schema 'false'/empty object is invalid",
	"draft2020-12/boolean_schema.json/boolean schema 'false'/array is invalid",
	"draft2020-12/boolean_schema.json/boolean schema 'false'/empty array is invalid",
	"draft2020-12/defs.json/validate definition against metaschema/valid definition schema",
	"draft2020-12/dependentSchemas.json/boolean subschemas/object with property having schema false is invalid",
	"draft2020-12/dependentSchemas.json/boolean subschemas/object with both properties is invalid",
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
	"draft2020-12/id.json/Valid use of empty fragments in location-independent $id/Identifier name with absolute URI",
	"draft2020-12/id.json/Valid use of empty fragments in location-independent $id/Identifier name with base URI change in subschema",
	"draft2020-12/id.json/Unnormalized $ids are allowed but discouraged/Unnormalized identifier",
	"draft2020-12/id.json/Unnormalized $ids are allowed but discouraged/Unnormalized identifier and no ref",
	"draft2020-12/id.json/Unnormalized $ids are allowed but discouraged/Unnormalized identifier with empty fragment",
	"draft2020-12/id.json/Unnormalized $ids are allowed but discouraged/Unnormalized identifier with empty fragment and no ref",
	"draft2020-12/id.json/$id inside an enum is not a real identifier/exact match to enum, and type matches",
	"draft2020-12/id.json/$id inside an enum is not a real identifier/match $ref to $id",
	"draft2020-12/patternProperties.json/multiple simultaneous patternProperties are validated/an invalid due to the other is invalid",
	"draft2020-12/patternProperties.json/patternProperties with boolean schemas/object with a property matching both true and false is invalid",
	"draft2020-12/properties.json/properties, patternProperties, additionalProperties interaction/patternProperty invalidates property",
	"draft2020-12/ref.json/remote ref, containing refs itself/remote ref valid",
	"draft2020-12/ref.json/Recursive references between schemas/valid tree",
	"draft2020-12/ref.json/ref creates new scope when adjacent to keywords/referenced subschema doesn't see annotations from properties",
	"draft2020-12/ref.json/refs with relative uris and defs/valid on both fields",
	"draft2020-12/ref.json/relative refs with absolute uris and defs/valid on both fields",
	"draft2020-12/ref.json/$id must be resolved against nearest parent, not just immediate parent/number should pass",
	"draft2020-12/ref.json/order of evaluation: $id and $ref/data is valid against first definition",
	"draft2020-12/ref.json/order of evaluation: $id and $anchor and $ref/data is valid against first definition",
	"draft2020-12/refRemote.json/remote ref/remote ref valid",
	"draft2020-12/refRemote.json/fragment within remote ref/remote fragment valid",
	"draft2020-12/refRemote.json/ref within remote ref/ref within ref valid",
	"draft2020-12/refRemote.json/base URI change/base URI change ref valid",
	"draft2020-12/refRemote.json/base URI change - change folder/number is valid",
	"draft2020-12/refRemote.json/base URI change - change folder in subschema/number is valid",
	"draft2020-12/refRemote.json/root ref in remote ref/string is valid",
	"draft2020-12/refRemote.json/root ref in remote ref/null is valid",
	"draft2020-12/refRemote.json/remote ref with ref to defs/valid",
	"draft2020-12/refRemote.json/Location-independent identifier in remote ref/integer is valid",
	"draft2020-12/unevaluatedProperties.json/unevaluatedProperties with if/then/else/when if is false and has unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/unevaluatedProperties with if/then/else, then not defined/when if is false and has unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/unevaluatedProperties with dependentSchemas/with no unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/unevaluatedProperties with $ref/with no unevaluated properties",
	"draft2020-12/unevaluatedProperties.json/dynamic evalation inside nested refs/all is valid",
	"draft2020-12/unevaluatedProperties.json/dynamic evalation inside nested refs/all + foo is valid",
	"draft2020-12/uniqueItems.json/uniqueItems validation/non-unique array of objects is invalid",
	"draft2020-12/uniqueItems.json/uniqueItems validation/non-unique array of nested objects is invalid",
	"draft2020-12/uniqueItems.json/uniqueItems validation/non-unique array of arrays is invalid",
	"draft2020-12/uniqueItems.json/uniqueItems validation/non-unique array of more than two arrays is invalid",
	"draft2020-12/uniqueItems.json/uniqueItems validation/non-unique heterogeneous types are invalid",
	"draft2020-12/uniqueItems.json/uniqueItems validation/objects are non-unique despite key order",
	"draft2020-12/unknownKeyword.json/$id inside an unknown keyword is not a real identifier/type matches second anyOf, which has a real schema in it",
	"draft2020-12/vocabulary.json/schema that uses custom metaschema with with no validation vocabulary/no validation: invalid number, but it still validates"
]);
initializeTests();