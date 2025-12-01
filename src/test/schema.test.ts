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
import { getLanguageService, JSONSchema, SchemaRequestService, TextDocument, MatchingSchema, LanguageService } from '../jsonLanguageService';
import { DiagnosticSeverity, SchemaConfiguration } from '../jsonLanguageTypes';

function toDocument(text: string, config?: Parser.JSONDocumentConfig, uri = 'foo://bar/file.json'): { textDoc: TextDocument, jsonDoc: Parser.JSONDocument } {

	const textDoc = TextDocument.create(uri, 'json', 0, text);
	const jsonDoc = Parser.parse(textDoc, config);
	return { textDoc, jsonDoc };
}

suite('JSON Schema', () => {

	const fixureDocuments: { [uri: string]: string } = {
		'http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json': 'deploymentTemplate.json',
		'http://schema.management.azure.com/schemas/2015-01-01/deploymentParameters.json': 'deploymentParameters.json',
		'http://schema.management.azure.com/schemas/2015-01-01/Microsoft.Authorization.json': 'Microsoft.Authorization.json',
		'http://schema.management.azure.com/schemas/2015-01-01/Microsoft.Resources.json': 'Microsoft.Resources.json',
		'http://schema.management.azure.com/schemas/2014-04-01-preview/Microsoft.Sql.json': 'Microsoft.Sql.json',
		'http://schema.management.azure.com/schemas/2014-06-01/Microsoft.Web.json': 'Microsoft.Web.json',
		'http://schema.management.azure.com/schemas/2014-04-01/SuccessBricks.ClearDB.json': 'SuccessBricks.ClearDB.json',
		'http://schema.management.azure.com/schemas/2015-08-01/Microsoft.Compute.json': 'Microsoft.Compute.json'
	};

	function newMockRequestService(schemas: { [uri: string]: JSONSchema } = {}, accesses: string[] = []): SchemaRequestService {

		return async (uri: string): Promise<string> => {
			if (uri.length && uri[uri.length - 1] === '#') {
				uri = uri.substr(0, uri.length - 1);
			}
			const schema = schemas[uri];
			if (schema) {
				if (accesses.indexOf(uri) === -1) {
					accesses.push(uri);
				}
				return Promise.resolve(JSON.stringify(schema));
			}

			const fileName = fixureDocuments[uri];
			if (fileName) {
				const fixturePath = path.join(__dirname, '../../../src/test/fixtures', fileName);
				return (await fs.readFile(fixturePath)).toString();
			}
			throw new Error("Resource not found");
		};
	}

	const workspaceContext = {
		resolveRelativePath: (relativePath: string, resource: string) => {
			return url.resolve(resource, relativePath);
		}
	};

	test('Resolving $refs', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main": {
					id: 'https://myschemastore/main',
					type: 'object',
					properties: {
						child: {
							'$ref': 'https://myschemastore/child'
						}
					}
				},
				"https://myschemastore/child": {
					id: 'https://myschemastore/child',
					type: 'bool',
					description: 'Test description'
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main');
		assert.deepStrictEqual(fs?.schema.properties?.['child'], {
			type: 'bool',
			description: 'Test description'
		});


	});

	test('Resolving $refs 2', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"http://json.schemastore.org/swagger-2.0": {
					id: 'http://json.schemastore.org/swagger-2.0',
					type: 'object',
					properties: {
						"responseValue": {
							"$ref": "#/definitions/jsonReference"
						}
					},
					definitions: {
						"jsonReference": {
							"type": "object",
							"required": ["$ref"],
							"properties": {
								"$ref": {
									"type": "string"
								}
							}
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('http://json.schemastore.org/swagger-2.0');
		assert.deepStrictEqual(fs?.schema.properties?.['responseValue'], {
			type: 'object',
			required: ["$ref"],
			properties: { $ref: { type: 'string' } }
		});


	});

	test('Resolving $refs 3', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/main/schema1.json',
					type: 'object',
					properties: {
						p1: {
							'$ref': 'schema2.json#/definitions/hello'
						},
						p2: {
							'$ref': './schema2.json#/definitions/hello'
						},
						p3: {
							'$ref': '/main/schema2.json#/definitions/hello'
						}
					}
				},
				"https://myschemastore/main/schema2.json": {
					id: 'https://myschemastore/main/schema2.json',
					definitions: {
						"hello": {
							"type": "string",
							"enum": ["object"],
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(fs?.schema.properties?.['p1'], {
			type: 'string',
			enum: ["object"]
		});
		assert.deepStrictEqual(fs?.schema.properties?.['p2'], {
			type: 'string',
			enum: ["object"]
		});
		assert.deepStrictEqual(fs?.schema.properties?.['p3'], {
			type: 'string',
			enum: ["object"]
		});


	});

	test('Resolving $refs 4', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/main/schema1.json',
					type: 'object',
					properties: {
						p1: {
							'$ref': 'schema2.json#/definitions/hello'
						},
						p2: {
							'$ref': './schema2.json#/definitions/hello'
						},
						p3: {
							'$ref': '/main/schema2.json#/definitions/hello'
						}
					}
				},
				"https://myschemastore/main/schema2.json": {
					id: 'https://myschemastore/main/schema2.json',
					definitions: {
						"hello": {
							"type": "string",
							"enum": ["object"],
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(fs?.schema.properties?.['p1'], {
			type: 'string',
			enum: ["object"]
		});
		assert.deepStrictEqual(fs?.schema.properties?.['p2'], {
			type: 'string',
			enum: ["object"]
		});
		assert.deepStrictEqual(fs?.schema.properties?.['p3'], {
			type: 'string',
			enum: ["object"]
		});

	});

	test('Resolving escaped $refs', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/main/schema1.json',
					type: 'object',
					properties: {
						p1: {
							'$ref': 'schema2.json#/definitions/hello~0foo~1bar'
						},
						p2: {
							'$ref': './schema2.json#/definitions/hello~0foo~1bar'
						},
						p3: {
							'$ref': '/main/schema2.json#/definitions/hello~0foo~1bar'
						}
					}
				},
				"https://myschemastore/main/schema2.json": {
					id: 'https://myschemastore/main/schema2.json',
					definitions: {
						"hello~foo/bar": {
							"type": "string",
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(fs?.schema.properties?.['p1'], {
			type: 'string'
		});
		assert.deepStrictEqual(fs?.schema.properties?.['p2'], {
			type: 'string'
		});
		assert.deepStrictEqual(fs?.schema.properties?.['p3'], {
			type: 'string'
		});
	});

	test('Resolving $refs to local $ids', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/main/schema1.json',
					definitions: {
						hello: {
							id: '#hello',
							type: 'string',
							const: 'hello'
						},
						world: {
							$id: '#world',
							type: 'string',
							const: 'world'
						}
					},
					type: 'object',
					properties: {
						p1: {
							$ref: '#hello'
						},
						p2: {
							$ref: '#world'
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(fs?.schema.properties?.p1, {
			type: 'string',
			const: 'hello'
		});
		assert.deepStrictEqual(fs?.schema.properties?.p2, {
			type: 'string',
			const: 'world'
		});
	});

	test('Resolving $refs to local $anchors', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"https://example.com/schemas/address": {
					"$id": "https://example.com/schemas/address",

					"type": "object",
					"properties": {
						"street_address":
						{
							"$anchor": "street_address",
							"type": "string"
						},
						"city": { "type": "string" },
						"state": { "type": "string" }
					},
					"required": ["street_address", "city", "state"]
				},
				"https://example.com/schemas/customer": {
					"$id": "https://example.com/schemas/customer",

					"type": "object",
					"properties": {
						"first_name": { "type": "string" },
						"last_name": { "type": "string" },
						"street_address": { "$ref": "/schemas/address#street_address" },
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('https://example.com/schemas/customer');
		assert.deepStrictEqual(fs?.schema.properties?.street_address, {
			type: 'string',
			$anchor: "street_address"
		});
	});

	test('Resolving $refs to external $ids', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/main/schema1.json',
					type: 'object',
					properties: {
						p1: {
							'$ref': 'schema2.json#hello'
						},
						p2: {
							'$ref': './schema2.json#/definitions/hello'
						},
						p3: {
							'$ref': '/main/schema2.json#/definitions/hello'
						}
					}
				},
				"https://myschemastore/main/schema2.json": {
					id: 'https://myschemastore/main/schema2.json',
					definitions: {
						"hello": {
							$id: "#hello",
							"type": "string",
							"enum": ["object"],
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(fs?.schema.properties?.['p1'], {
			type: 'string',
			enum: ["object"]
		});
		assert.deepStrictEqual(fs?.schema.properties?.['p2'], {
			type: 'string',
			enum: ["object"]
		});
		assert.deepStrictEqual(fs?.schema.properties?.['p3'], {
			type: 'string',
			enum: ["object"]
		});
	});

	test('Resolving $refs to external $ids with same as local', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/main/schema1.json',
					definitions: {
						"hello": {
							$id: "#hello",
							"type": "string",
							"const": "wrong",
						}
					},
					type: 'object',
					properties: {
						p1: {
							'$ref': 'schema2.json#hello'
						}
					}
				},
				"https://myschemastore/main/schema2.json": {
					id: 'https://myschemastore/main/schema2.json',
					definitions: {
						"hello": {
							$id: "#hello",
							"type": "string",
							"const": "correct"
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(fs?.schema.properties?.['p1'], {
			type: 'string',
			const: 'correct'
		});
	});


	test('Resolving external $ref two levels', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/main/schema1.json',
					type: 'object',
					properties: {
						p1: {
							$ref: 'schema2.json#blue'
						}
					}
				},
				"https://myschemastore/main/schema3.json": {
					id: 'https://myschemastore/main/schema3.json',
					definitions: {
						"world": {
							$id: '#world',
							type: 'string',
							const: 'world'
						}
					}
				},
				"https://myschemastore/main/schema2.json": {
					id: 'https://myschemastore/main/schema2.json',
					definitions: {
						"_blue": {
							$id: '#blue',
							$ref: 'schema3.json#world',
							description: '_blue',
						}
					}
				}
			}
		});

		const resolvedSchema = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(resolvedSchema?.schema.properties?.p1, {
			type: 'string',
			const: 'world',
			description: '_blue'
		});
	});

	test('Resolving external $ref referenced multiple times', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/main/schema1.json',
					type: 'object',
					properties: {
						p1: {
							$ref: 'schema2.json#blue'
						},
						p2: {
							'$ref': 'https://myschemastore/main/schema2.json#blue'
						},
						p3: {
							'$ref': 'https://myschemastore/main/schema2.json#/definitions/_blue'
						}
					}
				},
				"https://myschemastore/main/schema2.json": {
					id: 'https://myschemastore/main/schema2.json',
					definitions: {
						"_blue": {
							$id: '#blue',
							const: 'blue'
						}
					}
				}
			}
		});

		const resolvedSchema = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(resolvedSchema?.schema.properties?.p1, {
			const: 'blue'
		});
		assert.deepStrictEqual(resolvedSchema?.schema.properties?.p2, {
			const: 'blue'
		});
		assert.deepStrictEqual(resolvedSchema?.schema.properties?.p3, {
			const: 'blue'
		});
	});

	test('Resolving external $ref to ref', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/main/schema1.json',
					type: 'object',
					properties: {
						p1: {
							'$ref': 'https://myschemastore/main/schema2.json#red'
						}
					}
				},
				"https://myschemastore/main/schema2.json": {
					id: 'https://myschemastore/main/schema2.json',
					definitions: {
						"_red": {
							$id: '#red',
							$ref: '#yellow'
						},
						"_yellow": {
							$id: '#yellow',
							type: 'number',
							const: 5
						}
					}
				}
			}
		});

		const resolvedSchema = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(resolvedSchema?.schema.properties?.p1, {
			type: 'number',
			const: 5
		});
	});

	test('Resolving external $ref recursive', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/main/schema1.json',
					definitions: {
						"world": {
							$id: '#world',
							type: 'string',
							const: 'world'
						}
					},
					type: 'object',
					properties: {
						p1: {
							$ref: 'schema2.json#blue'
						}
					}
				},
				"https://myschemastore/main/schema2.json": {
					id: 'https://myschemastore/main/schema2.json',
					definitions: {
						"blue": {
							$id: '#blue',
							$ref: 'schema1.json#world'
						}
					}
				}
			}
		});

		const resolvedSchema = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(resolvedSchema?.schema.properties?.p1, {
			type: 'string',
			const: 'world'
		});
	});


	test('Resolving external $ref to already resolved schema', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					type: 'object',
					properties: {
						p1: {
							$ref: 'schema2.json#blue'
						}
					}
				},
				"https://myschemastore/main/schema3.json": {
					type: 'object',
					properties: {
						p1: {
							$ref: 'schema2.json#blue'
						}
					}
				},
				"https://myschemastore/main/schema2.json": {
					definitions: {
						"blue": {
							$id: '#blue',
							type: 'string',
							const: 'blue'
						}
					}
				}
			}
		});

		const resolvedSchema1 = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(resolvedSchema1?.schema.properties?.p1, {
			type: 'string',
			const: 'blue'
		});
		const resolvedSchema3 = await service.getResolvedSchema('https://myschemastore/main/schema3.json');
		assert.deepStrictEqual(resolvedSchema3?.schema.properties?.p1, {
			type: 'string',
			const: 'blue'
		});
	});


	test('Resolving $refs 5', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					"type": "object",
					"properties": {
						"p1": {
							"$ref": "#hello"
						},
						"p2": {
							"$ref": "#world"
						},
						"p3": {
							"id": "#hello",
							"type": "string",
							"const": "hello"
						},
						"p4": {
							"type": "object",
							"properties": {
								"deep": {
									"$id": "#world",
									"type": "string",
									"const": "world"
								}
							},
							"additionalProperties": false
						}
					},
					"additionalProperties": false
				},
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(fs?.schema.properties?.['p1'], {
			type: 'string',
			const: 'hello'
		});

		assert.deepStrictEqual(fs?.schema.properties?.['p2'], {
			"type": "string",
			"const": "world"
		});
	});

	test('Recursive $refs to $ids', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					"type": "object",
					"definitions": {
						"foo": {
							"id": "#foo",
							"type": "object",
							"properties": {
								"bar": {
									"type": "string",
									"const": "hello"
								},
								"foo": {
									"$ref": "#foo"
								}
							},
							"additionalProperties": false
						}
					},
					"properties": {
						"foo": {
							"$ref": "#foo"
						}
					},
					"additionalProperties": false
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main/schema1.json');
		assert.deepStrictEqual(fs?.schema.properties?.['foo'], {
			"type": "object",
			"properties": {
				"bar": {
					"type": "string",
					"const": "hello"
				},
				"foo": {
					"additionalProperties": false,
					properties: fs?.schema.definitions?.['foo'].properties,
					type: "object"
				}
			},
			"additionalProperties": false
		});
	});

	test('FileSchema', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"test://schemas/main": {
					id: 'test://schemas/main',
					type: 'object',
					properties: {
						child: {
							type: 'object',
							properties: {
								'grandchild': {
									type: 'number',
									description: 'Meaning of Life'
								}
							}
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('test://schemas/main');
		const section = fs?.getSection(['child', 'grandchild']);
		assert.strictEqual(section?.description, 'Meaning of Life');
	});

	test('Array FileSchema', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"test://schemas/main": {
					id: 'test://schemas/main',
					type: 'object',
					properties: {
						child: {
							type: 'array',
							items: {
								'type': 'object',
								'properties': {
									'grandchild': {
										type: 'number',
										description: 'Meaning of Life'
									}
								}
							}
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('test://schemas/main');
		const section = fs?.getSection(['child', '0', 'grandchild']);
		assert.strictEqual(section?.description, 'Meaning of Life');
	});

	test('Missing subschema', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"test://schemas/main": {
					id: 'test://schemas/main',
					type: 'object',
					properties: {
						child: {
							type: 'object'
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('test://schemas/main');
		const section = fs?.getSection(['child', 'grandchild']);
		assert.strictEqual(section, undefined);
	});

	test('Preloaded Schema', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		const id = 'https://myschemastore/test1';
		const schema: JSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'object',
					properties: {
						'grandchild': {
							type: 'number',
							description: 'Meaning of Life'
						}
					}
				}
			}
		};

		service.registerExternalSchema({ uri: id, fileMatch: ['*.json'], schema: schema });

		const fs = await service.getSchemaForResource('test.json');
		const section = fs?.getSection(['child', 'grandchild']);
		assert.strictEqual(section?.description, 'Meaning of Life');
	});

	test('Preloaded Schema, string as URI', async function () {
		// for https://github.com/microsoft/monaco-editor/issues/2683
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		const id = 'a5f8f39b-c7ee-48f8-babe-b7146ed3c055';
		const schema: JSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'object',
					properties: {
						'grandchild': {
							type: 'number',
							description: 'Meaning of Life'
						}
					}
				}
			}
		};

		service.registerExternalSchema({ uri: id, fileMatch: ['*.json'], schema: schema });

		const fs = await service.getSchemaForResource('test.json');
		const section = fs?.getSection(['child', 'grandchild']);
		assert.strictEqual(section?.description, 'Meaning of Life');
	});

	test('Multiple matches', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		const id1 = 'https://myschemastore/test1';
		const schema1: JSONSchema = {
			type: 'object',
			properties: {
				foo: {
					enum: [1],
				}
			}
		};

		const id2 = 'https://myschemastore/test2';
		const schema2: JSONSchema = {
			type: 'object',
			properties: {
				bar: {
					enum: [2],
				}
			}
		};

		service.registerExternalSchema({ uri: id1, fileMatch: ['*.json'], schema: schema1 });
		service.registerExternalSchema({ uri: id2, fileMatch: ['test.json'], schema: schema2 });

		const fs = await service.getSchemaForResource('test.json');
		const { textDoc, jsonDoc } = toDocument(JSON.stringify({ foo: true, bar: true }));
		const problems = jsonDoc.validate(textDoc, fs?.schema);
		assert.strictEqual(problems?.length, 2);

	});

	test('External Schema', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		const id = 'https://myschemastore/test1';
		const schema: JSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'object',
					properties: {
						'grandchild': {
							type: 'number',
							description: 'Meaning of Life'
						}
					}
				}
			}
		};

		service.registerExternalSchema({ uri: id, fileMatch: ['*.json'], schema: schema });

		const fs = await service.getSchemaForResource('test.json');
		const section = fs?.getSection(['child', 'grandchild']);
		assert.strictEqual(section?.description, 'Meaning of Life');
	});


	test('Resolving in-line $refs', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		const id = 'https://myschemastore/test1';

		const schema: JSONSchema = {
			id: 'test://schemas/main',
			type: 'object',
			definitions: {
				'grandchild': {
					type: 'number',
					description: 'Meaning of Life'
				}
			},
			properties: {
				child: {
					type: 'array',
					items: {
						'type': 'object',
						'properties': {
							'grandchild': {
								$ref: '#/definitions/grandchild'
							}
						}
					}
				}
			}
		};

		service.registerExternalSchema({ uri: id, fileMatch: ['*.json'], schema: schema });

		const fs = await service.getSchemaForResource('test.json');
		const section = fs?.getSection(['child', '0', 'grandchild']);
		assert.strictEqual(section?.description, 'Meaning of Life');
	});

	test('Resolving in-line $refs automatically for external schemas', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		const id = 'https://myschemastore/test1';
		const schema: JSONSchema = {
			id: 'test://schemas/main',
			type: 'object',
			definitions: {
				'grandchild': {
					type: 'number',
					description: 'Meaning of Life'
				}
			},
			properties: {
				child: {
					type: 'array',
					items: {
						'type': 'object',
						'properties': {
							'grandchild': {
								$ref: '#/definitions/grandchild'
							}
						}
					}
				}
			}
		};

		const fsm = service.registerExternalSchema({ uri: id, fileMatch: ['*.json'], schema: schema });
		const fs = await fsm.getResolvedSchema();
		const section = fs.getSection(['child', '0', 'grandchild']);
		assert.strictEqual(section?.description, 'Meaning of Life');
	});


	test('Clearing External Schemas', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		const id1 = 'http://myschemastore/test1';
		const schema1: JSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'number'
				}
			}
		};

		const id2 = 'http://myschemastore/test2';
		const schema2: JSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'string'
				}
			}
		};

		service.registerExternalSchema({ uri: id1, fileMatch: ['test.json', 'bar.json'], schema: schema1 });

		const fs = await service.getSchemaForResource('test.json');
		assert.strictEqual(fs?.getSection(['child'])?.type, 'number');

		service.clearExternalSchemas();

		service.registerExternalSchema({ uri: id2, fileMatch: ['*.json'], schema: schema2 });

		const fs2 = await service.getSchemaForResource('test.json');
		assert.strictEqual(fs2?.getSection(['child'])?.type, 'string');

	});

	test('Schema contributions', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"http://myschemastore/myschemabar": {
					id: 'http://myschemastore/myschemabar',
					type: 'object',
					properties: {
						foo: {
							type: 'string'
						}
					}
				}
			},
			schemaAssociations: [
				{
					pattern: ['*.bar'],
					uris: ['http://myschemastore/myschemabar', 'http://myschemastore/myschemafoo']
				}
			]
		});

		const id2 = 'http://myschemastore/myschemafoo';
		const schema2: JSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'string'
				}
			}
		};

		service.registerExternalSchema({ uri: id2, schema: schema2 });

		let resolvedSchema = await service.getSchemaForResource('main.bar');
		assert.deepStrictEqual(resolvedSchema?.errors, []);
		assert.strictEqual(2, resolvedSchema?.schema.allOf?.length);

		service.clearExternalSchemas();

		resolvedSchema = await service.getSchemaForResource('main.bar');
		assert.strictEqual(resolvedSchema?.errors.length, 1);
		assert.strictEqual(resolvedSchema?.errors[0], "Problems loading reference 'http://myschemastore/myschemafoo': Unable to load schema from 'http://myschemastore/myschemafoo': Resource not found.");

		service.clearExternalSchemas();
		service.registerExternalSchema({ uri: id2, schema: schema2 });

		resolvedSchema = await service.getSchemaForResource('main.bar');
		assert.strictEqual(resolvedSchema?.errors.length, 0);

	});

	test('Exclusive file patterns', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"http://myschemastore/myschemabar": {
					maxProperties: 0
				}
			},
			schemaAssociations: [
				{
					pattern: ['/folder/*.json', '!/folder/bar/*.json', '/folder/bar/zoo.json'],
					uris: ['http://myschemastore/myschemabar']
				}
			]
		});
		const positives = ['/folder/a.json', '/folder/bar.json', '/folder/bar/zoo.json'];
		const negatives = ['/folder/bar/a.json', '/folder/bar/z.json'];

		for (const positive of positives) {
			assert.ok(await service.getSchemaForResource(positive), positive);
		}
		for (const negative of negatives) {
			assert.ok(!await service.getSchemaForResource(negative), negative);
		}
	});

	async function assertMatchingSchemas(ls: LanguageService, positives: string[], negatives: string[]) {
		for (const positive of positives) {
			const doc = toDocument("{}", undefined, positive);
			const ms = await ls.getMatchingSchemas(doc.textDoc, doc.jsonDoc);
			assert.ok(ms.length > 0, positive);
		}

		for (const negative of negatives) {
			const doc = toDocument("{}", undefined, negative);
			const ms = await ls.getMatchingSchemas(doc.textDoc, doc.jsonDoc);
			assert.ok(ms.length === 0, negative);
		}
	}

	test('Schema matching, where fileMatch is a literal pattern, and denotes filename only', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['part.json'], schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['file:///folder/part.json', 'file:///folder/part.json?f=true', 'file:///folder/part.json#f=true'];
		const negatives = ['file:///folder/rampart.json', 'file:///folder/part.json/no.part.json', 'file:///folder/foo?part.json', 'file:///folder/foo#part.json'];

		assertMatchingSchemas(ls, positives, negatives);
	});

	test('Schema matching, match files starting with dots', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['/User/settings.json'], schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['vscode-userdata:/home/martin/.config/Code%20-%20Insiders/User/settings.json'];

		assertMatchingSchemas(ls, positives, []);
	});



	test('Schema matching, where fileMatch is a literal pattern, and denotes a path with a leading slash', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['/folder/part.json'], schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['file:///folder/part.json', 'file:///folder/part.json?f=true', 'file:///folder/part.json#f=true'];
		const negatives = ['file:///folder/rampart.json', 'file:///folder/part.json/no.part.json', 'file:///folder/foo?part.json', 'file:///folder/foo#part.json'];

		assertMatchingSchemas(ls, positives, negatives);
	});

	test('Schema matching, where fileMatch is a literal pattern, and denotes a path', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['take/part.json'], schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['file:///folder/take/part.json', 'file:///folder/take/part.json?f=true', 'file:///folder/take/part.json#f=true'];
		const negatives = ['file:///folder/part.json', 'file:///folder/.take/part.json', 'file:///folder/take.part.json', 'file:///folder/take/part.json/no.part.json', 'file:///folder/take?part.json', 'file:///folder/foo?take/part.json', 'file:///folder/take#part.json', 'file:///folder/foo#take/part.json', 'file:///folder/take/no/part.json'];

		assertMatchingSchemas(ls, positives, negatives);
	});

	test('Schema matching, where fileMatch is a wildcard pattern, contains no double-star, and denotes filename only', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['*.foo.json'], schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['file:///folder/a.foo.json', 'file:///folder/a.foo.json?f=true', 'file:///folder/a.foo.json#f=true'];
		const negatives = ['file:///folder/a.bar.json', 'file:///folder/foo?a.foo.json', 'file:///folder/foo#a.foo.json'];

		assertMatchingSchemas(ls, positives, negatives);
	});

	test('Schema matching, where fileMatch is a wildcard pattern, contains no double-star, and denotes a path', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['foo/*/bar.json'], schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['file:///folder/foo/bat/bar.json', 'file:///folder/foo/bat/bar.json?f=true', 'file:///folder/foo/bat/bar.json#f=true'];
		const negatives = ['file:///folder/a.bar.json', 'file:///folder/foo/bar.json', 'file:///folder/foo/can/be/as/deep/as/the/ocean/floor/bar.json', 'file:///folder/foo/bar.json?f=true', 'file:///folder/foo/can/be/as/deep/as/the/ocean/floor/bar.json?f=true', 'file:///folder/foo/bar.json#f=true', 'file:///folder/foo/can/be/as/deep/as/the/ocean/floor/bar.json#f=true', 'file:///folder/foo/bar.json/bat/bar.json', 'file:///folder/foo.bar.json', 'file:///folder/foo.bat/bar.json', 'file:///folder/foo/bar.json/bat.json', 'file:///folder/.foo/bar.json', 'file:///folder/.foo/bat/bar.json', 'file:///folder/.foo/bat/man/bar.json', 'file:///folder/foo?foo/bar.json', 'file:///folder/foo?foo/bat/bar.json', 'file:///folder/foo?foo/bat/man/bar.json', 'file:///folder/foo#foo/bar.json', 'file:///folder/foo#foo/bat/bar.json', 'file:///folder/foo#foo/bat/man/bar.json'];

		assertMatchingSchemas(ls, positives, negatives);
	});

	test('Schema matching, where fileMatch is a wildcard pattern, contains double-star, and denotes a path', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['foo/**/bar.json'], schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['file:///folder/foo/bar.json', 'file:///folder/foo/bat/bar.json', 'file:///folder/foo/can/be/as/deep/as/the/ocean/floor/bar.json', 'file:///folder/foo/bar.json?f=true', 'file:///folder/foo/bat/bar.json?f=true', 'file:///folder/foo/can/be/as/deep/as/the/ocean/floor/bar.json?f=true', 'file:///folder/foo/bar.json#f=true', 'file:///folder/foo/bat/bar.json#f=true', 'file:///folder/foo/can/be/as/deep/as/the/ocean/floor/bar.json#f=true', 'file:///folder/foo/bar.json/bat/bar.json'];
		const negatives = ['file:///folder/a.bar.json', 'file:///folder/foo.bar.json', 'file:///folder/foo.bat/bar.json', 'file:///folder/foo/bar.json/bat.json', 'file:///folder/.foo/bar.json', 'file:///folder/.foo/bat/bar.json', 'file:///folder/.foo/bat/man/bar.json', 'file:///folder/foo?foo/bar.json', 'file:///folder/foo?foo/bat/bar.json', 'file:///folder/foo?foo/bat/man/bar.json', 'file:///folder/foo#foo/bar.json', 'file:///folder/foo#foo/bat/bar.json', 'file:///folder/foo#foo/bat/man/bar.json'];

		assertMatchingSchemas(ls, positives, negatives);
	});

	test('Schema matching with folder URI ', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['foo.json'], folderUri: 'file:///folder1', schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['file:///folder1/foo.json', 'file:///folder1/foo/foo.json', 'file:///folder1/foo/can/be/as/deep/as/the/ocean/floor/foo.json', 'file:///folder1/foo/foo.json?f=true', 'file:///folder1/foo/bat/foo.json?f=true', 'file:///folder1/foo/foo.json/bat/foo.json'];
		const negatives = ['file:///folder/foo.json', 'file:///folder11/foo.json', 'file:///folder2/foo/foo.json', 'file:///folder2/foo/can/be/as/deep/as/the/ocean/floor/foo.json', 'file:///folder2/foo/foo.json?f=true'];

		assertMatchingSchemas(ls, positives, negatives);
	});

	test('Schema matching with folder URI ending with slash', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['foo.json'], folderUri: 'file:///parent/folder1/', schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['file:///parent/folder1/foo.json', 'file:///parent/folder1/foo/foo.json',];
		const negatives = ['file:///folder1/foo.json', 'file:///folder1/parent/folder1/foo.json'];

		assertMatchingSchemas(ls, positives, negatives);
	});

	test('Schema matching with encoding in folder URI', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['foo.json'], folderUri: 'file:///C%3A/parent/folder1/', schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['file:///C%3A/parent/folder1/foo.json', 'file:///C:/parent/folder1/foo.json', 'file:///c:/parent/folder1/foo.json'];
		const negatives = ['file:///d:/parent/folder1/foo.json'];

		assertMatchingSchemas(ls, positives, negatives);
	});

	test('Schema matching with encoding in folder URI 2', async function () {

		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas: [{ uri: 'http://myschemastore/myschemabar', fileMatch: ['foo.json'], folderUri: 'file:///C:/parent/folder1/', schema: { type: 'object', required: ['foo'] } }] });

		const positives = ['file:///C%3A/parent/folder1/foo.json', 'file:///C:/parent/folder1/foo.json', 'file:///c:/parent/folder1/foo.json'];
		const negatives = ['file:///d:/parent/folder1/foo.json'];

		assertMatchingSchemas(ls, positives, negatives);
	});


	test('Resolving circular $refs', async function () {

		const service: SchemaService.IJSONSchemaService = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);

		const input = {
			"$schema": "http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
			"contentVersion": "1.0.0.0",
			"resources": [
				{
					"name": "SQLServer",
					"type": "Microsoft.Sql/servers",
					"location": "West US",
					"apiVersion": "2014-04-01-preview",
					"dependsOn": [],
					"tags": {
						"displayName": "SQL Server"
					},
					"properties": {
						"administratorLogin": "asdfasd",
						"administratorLoginPassword": "asdfasdfasd"
					}
				}
			]
		};

		const { textDoc, jsonDoc } = toDocument(JSON.stringify(input));

		const resolveSchema = await service.getSchemaForResource('file://doc/mydoc.json', jsonDoc);
		assert.deepStrictEqual(resolveSchema?.errors, []);

		const content = JSON.stringify(resolveSchema?.schema);
		assert.strictEqual(content.indexOf('$ref'), -1); // no more $refs

		const problems = jsonDoc.validate(textDoc, resolveSchema?.schema);
		assert.deepStrictEqual(problems, []);

	});

	test('Resolving circular $refs, invalid document', async function () {

		const service: SchemaService.IJSONSchemaService = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);

		const input = {
			"$schema": "http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
			"contentVersion": "1.0.0.0",
			"resources": [
				{
					"name": "foo",
					"type": "Microsoft.Resources/deployments",
					"apiVersion": "2015-01-01",
				}
			]
		};

		const { textDoc, jsonDoc } = toDocument(JSON.stringify(input));

		const resolveSchema = await service.getSchemaForResource('file://doc/mydoc.json', jsonDoc);
		assert.deepStrictEqual(resolveSchema?.errors, []);

		const content = JSON.stringify(resolveSchema?.schema);
		assert.strictEqual(content.indexOf('$ref'), -1); // no more $refs

		const problems = jsonDoc.validate(textDoc, resolveSchema?.schema);
		assert.strictEqual(problems?.length, 1);

	});

	test('$refs in $ref', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		const id0 = "foo://bar/bar0";
		const id1 = "foo://bar/bar1";
		const schema0: JSONSchema = {
			"allOf": [
				{
					$ref: id1
				}
			]
		};
		const schema1: JSONSchema = {
			$ref: "#/definitions/foo",
			definitions: {
				foo: {
					type: 'object',
				}
			},
		};

		const fsm0 = service.registerExternalSchema({ uri: id0, fileMatch: ['*.json'], schema: schema0 });
		service.registerExternalSchema({ uri: id1, fileMatch: [], schema: schema1 });
		const fs0 = await fsm0.getResolvedSchema();
		assert.strictEqual((<JSONSchema>fs0?.schema.allOf?.[0]).type, 'object');
	});

	test('$refs in $ref - circular', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main": {
					type: 'object',
					properties: {
						responseValue: {
							"$ref": "#/definitions/shellConfiguration"
						},
						hops: {
							"$ref": "#/definitions/hop1"
						}
					},
					definitions: {
						shellConfiguration: {
							$ref: '#/definitions/shellConfiguration',
							type: 'object'
						},
						hop1: {
							$ref: '#/definitions/hop2',
						},
						hop2: {
							$ref: '#/definitions/hop1',
							type: 'object'
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main');
		assert.deepStrictEqual(fs?.schema.properties?.['responseValue'], {
			type: 'object'
		});
		assert.deepStrictEqual(fs?.schema.properties?.['hops'], {
			type: 'object'
		});

	});

	test('$refs in $ref - circular 2', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main": {
					type: 'object',
					properties: {
						responseValue: {
							"$ref": "#/definitions/shellConfiguration"
						},
						hops: {
							"$ref": "#/definitions/hop1"
						}
					},
					definitions: {
						shellConfiguration: {
							$ref: '#/definitions/shellConfiguration',
							type: 'object'
						},
						hop1: {
							$ref: '#/definitions/hop2',
						},
						hop2: {
							$ref: '#/definitions/hop1',
							type: 'object'
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main');
		assert.deepStrictEqual(fs?.schema.properties?.['responseValue'], {
			type: 'object'
		});
		assert.deepStrictEqual(fs?.schema.properties?.['hops'], {
			type: 'object'
		});

	});


	test('$refs in $ref - across files', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main1": {
					type: 'object',
					definitions: {
						blue: {
							properties: {
								red: {
									$ref: '#/definitions/blue'
								}
							}
						}
					}
				},
				"https://myschemastore/main2": {
					type: 'object',
					definitions: {
						green: {
							$ref: 'main1#/definitions/blue'
						},
						white: {
							$ref: 'main1#/definitions/blue'
						}
					}
				}
			}
		});

		const fs = await service.getResolvedSchema('https://myschemastore/main2');
		assert.deepStrictEqual(fs?.schema.definitions?.green, {
			properties: {
				red: {
					properties: fs?.schema.definitions?.green.properties
				}
			}
		});
	});


	test('$refs with encoded characters', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		const id0 = "foo://bar/bar0";
		const schema: JSONSchema = {
			definitions: {
				'Foo<number>': {
					type: 'object',
				}
			},
			"type": "object",
			"properties": {
				"p1": { "enum": ["v1", "v2"] },
				"p2": { "$ref": "#/definitions/Foo%3Cnumber%3E" }
			}
		};

		const fsm0 = service.registerExternalSchema({ uri: id0, fileMatch: ['*.json'], schema: schema });
		const fs0 = await fsm0.getResolvedSchema();
		assert.deepStrictEqual(fs0.errors, []);
		assert.strictEqual((<JSONSchema>fs0?.schema.properties?.p2).type, 'object');

	});


	test('Validate Azure Resource Definition', async function () {
		const service: SchemaService.IJSONSchemaService = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);

		const input = {
			"$schema": "http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json#",
			"contentVersion": "1.0.0.0",
			"resources": [
				{
					"apiVersion": "2015-06-15",
					"type": "Microsoft.Compute/virtualMachines",
					"name": "a",
					"location": "West US",
					"properties": {
						"hardwareProfile": {
							"vmSize": "Small"
						},
						"osProfile": {
							"computername": "a",
							"adminUsername": "a",
							"adminPassword": "a"
						},
						"storageProfile": {
							"imageReference": {
								"publisher": "a",
								"offer": "a",
								"sku": "a",
								"version": "latest"
							},
							"osDisk": {
								"name": "osdisk",
								"vhd": {
									"uri": "[concat('http://', 'b','.blob.core.windows.net/',variables('vmStorageAccountContainerName'),'/',variables('OSDiskName'),'.vhd')]"
								},
								"caching": "ReadWrite",
								"createOption": "FromImage"
							}
						},
						"networkProfile": {
							"networkInterfaces": [
								{
									"id": "[resourceId('Microsoft.Network/networkInterfaces',variables('nicName'))]"
								}
							]
						},
						"diagnosticsProfile": {
							"bootDiagnostics": {
								"enabled": "true",
								"storageUri": "[concat('http://',parameters('newStorageAccountName'),'.blob.core.windows.net')]"
							}
						}
					}
				}
			]
		};

		const { textDoc, jsonDoc } = toDocument(JSON.stringify(input));

		const resolvedSchema = await service.getSchemaForResource('file://doc/mydoc.json', jsonDoc);
		assert.deepStrictEqual(resolvedSchema?.errors, []);

		const problems = jsonDoc.validate(textDoc, resolvedSchema?.schema);

		assert.strictEqual(problems?.length, 1);
		assert.strictEqual(problems?.[0].message, 'Missing property "computerName".');

	});

	test('Complex enums', function () {

		const input = {
			"group": {
				"kind": "build",
				"isDefault": false
			}
		};

		const schema = {
			"type": "object",
			"properties": {
				"group": {
					"oneOf": [
						{
							"type": "string"
						},
						{
							"type": "object",
							"properties": {
								"kind": {
									"type": "string",
									"default": "none",
									"description": "The task\"s execution group."
								},
								"isDefault": {
									"type": "boolean",
									"default": false,
									"description": "Defines if this task is the default task in the group."
								}
							}
						}
					],
					"enum": [
						{
							"kind": "build",
							"isDefault": true
						},
						{
							"kind": "build",
							"isDefault": false
						},
						{
							"kind": "test",
							"isDefault": true
						},
						{
							"kind": "test",
							"isDefault": false
						},
						"build",
						"test",
						"none"
					]
				}
			}
		};

		const { textDoc, jsonDoc } = toDocument(JSON.stringify(input));

		const problems = jsonDoc.validate(textDoc, schema);

		assert.strictEqual(problems?.length, 0);


	});

	test('resetSchema', async function () {
		const mainSchemaURI = "http://foo/main.schema.json";
		const aSchemaURI1 = "http://foo/a.schema.json";
		const bSchemaURI1 = "http://foo/b.schema.json";

		const schemas: { [uri: string]: JSONSchema } = {
			[mainSchemaURI]: {
				type: 'object',
				properties: {
					bar: {
						$ref: aSchemaURI1
					}
				}
			},
			[aSchemaURI1]: {
				type: 'object',
				properties: {
					a: {
						type: 'string'
					}
				}
			},
			[bSchemaURI1]: {
				type: 'boolean',
			}
		};
		const accesses: string[] = [];
		const schemaRequestService = newMockRequestService(schemas, accesses);

		const ls = getLanguageService({ workspaceContext, schemaRequestService });

		const testDoc = toDocument(JSON.stringify({ $schema: mainSchemaURI, bar: { a: 1 } }));
		let validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepStrictEqual(validation.map(v => v.message), ['Incorrect type. Expected "string".']);
		assert.deepStrictEqual([mainSchemaURI, aSchemaURI1], accesses); // b in not loaded as it is not references

		accesses.length = 0;

		// add a dependency to b

		schemas[aSchemaURI1] = {
			type: 'object',
			properties: {
				a: {
					$ref: bSchemaURI1
				}
			}
		};

		ls.resetSchema(aSchemaURI1);

		validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepStrictEqual(validation.map(v => v.message), ['Incorrect type. Expected "boolean".']);
		assert.deepStrictEqual([mainSchemaURI, aSchemaURI1, bSchemaURI1], accesses); // main, a and b are loaded

		// change to be but no reset

		schemas[bSchemaURI1] = {
			type: 'number'
		};

		accesses.length = 0;

		validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepStrictEqual(validation.map(v => v.message), ['Incorrect type. Expected "boolean".']);
		assert.deepStrictEqual([], accesses); // no loades as there was no reset

		// do the reset
		ls.resetSchema(bSchemaURI1);

		validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepStrictEqual(validation.map(v => v.message), []);
		assert.deepStrictEqual([mainSchemaURI, aSchemaURI1, bSchemaURI1], accesses); // main, a and b are loaded, main, a depend on b

		accesses.length = 0;

		// remove the dependency
		schemas[aSchemaURI1] = {
			type: 'object',
			properties: {
				a: {
					type: 'boolean'
				}
			}
		};

		ls.resetSchema(aSchemaURI1);
		validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepStrictEqual(validation.map(v => v.message), ['Incorrect type. Expected "boolean".']);
		assert.deepStrictEqual([mainSchemaURI, aSchemaURI1], accesses);


		accesses.length = 0;
		ls.resetSchema(bSchemaURI1);

		validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepStrictEqual(validation.map(v => v.message), ['Incorrect type. Expected "boolean".']);
		assert.deepStrictEqual([], accesses); // b is not depended anymore
	});

	test('resetSchema clears current document schema cache when not using $schema property', async function () {
		const schemaUri = "http://foo/main.schema.json";

		const schemas: { [uri: string]: JSONSchema } = {
			[schemaUri]: {
				type: 'object',
				properties: {
					bar: {
						type: 'string'
					}
				}
			}
		};

		const accesses: string[] = [];
		const schemaRequestService = newMockRequestService(schemas, accesses);
		const testDoc = toDocument(JSON.stringify({ bar: 1 }));

		const ls = getLanguageService({ workspaceContext, schemaRequestService });

		// configure the language service to use the schema for the test document
		ls.configure({
			schemas: [{
				uri: schemaUri,
				fileMatch: [testDoc.textDoc.uri.toString()],
			}]
		});

		// check using the existing schema
		let validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepStrictEqual(validation.map(v => v.message), ['Incorrect type. Expected "string".']);
		assert.deepStrictEqual([schemaUri], accesses);

		accesses.length = 0;

		// change a schema property and reset the schema
		schemas[schemaUri] = {
			type: 'object',
			properties: {
				a: {
					type: 'number'
				}
			}
		};
		ls.resetSchema(schemaUri);

		// now ensure validation occurs with the new schema
		validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepStrictEqual(validation.map(v => v.message), []);
		assert.deepStrictEqual([schemaUri], accesses);
	});

	test('getMatchingSchemas', async function () {

		const schema: JSONSchema = {
			type: 'object',
			$comment: 'schema',
			definitions: {
				baz: {
					type: 'boolean',
					$comment: 'baz',
				},
				key: {
					type: 'string',
					$comment: 'key',
				}
			},
			properties: {
				foo: {
					type: 'object',
					$comment: 'foo',
					properties: {
						bar: {
							type: 'number',
							$comment: 'bar',
						},
						baz: {
							$ref: "#/definitions/baz"
						}
					}
				}
			},
			propertyNames: {
				$ref: "#/definitions/key"
			}
		};

		const ls = getLanguageService({ workspaceContext });

		const testDoc = toDocument(JSON.stringify({ foo: { bar: 1, baz: true } }));
		const ms = await ls.getMatchingSchemas(testDoc.textDoc, testDoc.jsonDoc, schema);

		function assertMatchingSchema(ms: MatchingSchema[], nodeOffset: number, comment: string) {
			for (const m of ms) {
				if (m.node.offset === nodeOffset) {
					assert.strictEqual(m.schema.$comment, comment);
					return;
				}
			}
			assert.fail("No node at offset " + nodeOffset);
		}
		assertMatchingSchema(ms, 0, 'schema');
		assertMatchingSchema(ms, 1, 'key');
		assertMatchingSchema(ms, 7, 'foo');
		assertMatchingSchema(ms, 14, 'bar');
		assertMatchingSchema(ms, 22, 'baz');
	});

	test('schema resolving severity', async function () {
		const schema: JSONSchema = {
			$schema: 'http://json-schema.org/draft-03/schema#',
			type: 'string'
		};

		const ls = getLanguageService({});

		{
			const { textDoc, jsonDoc } = toDocument(JSON.stringify('SimpleJsonString'));
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const resolveError = await ls.doValidation(textDoc, jsonDoc, { schemaRequest: 'error' }, schema);
			assert.strictEqual(resolveError!.length, 1);
			assert.strictEqual(resolveError![0].severity, DiagnosticSeverity.Error);
		}
		{
			const { textDoc, jsonDoc } = toDocument(JSON.stringify('SimpleJsonString'));
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const resolveError = await ls.doValidation(textDoc, jsonDoc, {}, schema);
			assert.strictEqual(resolveError!.length, 1);
			assert.strictEqual(resolveError![0].severity, DiagnosticSeverity.Warning);
		}
	});

	test('schema with severity', async function () {
		const schema: JSONSchema = {
			type: 'object',
			properties: {
				'name': {
					type: 'string',
					minLength: 4,
				},
				'age': {
					type: 'number',
					minimum: 1,
				},
				'address': {
					type: 'string',
					minLength: 5,
				},
				'email': {
					type: 'string',
					format: 'email'
				},
				'depr': {
					type: 'string',
					deprecationMessage: 'old stuff'
				}
			},
			required: ['name', 'age', 'address', 'email']
		};

		const ls = getLanguageService({});
		{
			const { textDoc, jsonDoc } = toDocument('{ "depr": "" }');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = await ls.doValidation(textDoc, jsonDoc, { schemaValidation: 'error' }, schema);
			assert.strictEqual(semanticErrors!.length, 5);
			assert.strictEqual(semanticErrors![0].severity, DiagnosticSeverity.Error);
			assert.strictEqual(semanticErrors![1].severity, DiagnosticSeverity.Error);
			assert.strictEqual(semanticErrors![2].severity, DiagnosticSeverity.Error);
			assert.strictEqual(semanticErrors![3].severity, DiagnosticSeverity.Error);
			assert.strictEqual(semanticErrors![4].severity, DiagnosticSeverity.Warning);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"name": "", "age": -1, "address": "SA42", "email": "wrong_mail"}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = await ls.doValidation(textDoc, jsonDoc, { schemaValidation: 'warning' }, schema);
			assert.strictEqual(semanticErrors!.length, 4);
			assert.strictEqual(semanticErrors![0].severity, DiagnosticSeverity.Warning);
			assert.strictEqual(semanticErrors![1].severity, DiagnosticSeverity.Warning);
			assert.strictEqual(semanticErrors![2].severity, DiagnosticSeverity.Warning);
			assert.strictEqual(semanticErrors![3].severity, DiagnosticSeverity.Warning);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"name": "", "age": -1, "address": "SA42", "email": "wrong_mail"}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = await ls.doValidation(textDoc, jsonDoc, { schemaValidation: 'ignore' }, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{"name": "Alice", "age": 23, "address": "Solarstreet 42", "email": "alice@foo.com"}');
			assert.strictEqual(jsonDoc.syntaxErrors.length, 0);

			const semanticErrors = await ls.doValidation(textDoc, jsonDoc, {}, schema);
			assert.strictEqual(semanticErrors!.length, 0);
		}
	});

	test('getLanguageStatus', async function () {
		const schemas: SchemaConfiguration[] = [{
			uri: 'https://myschemastore/schema1.json',
			fileMatch: ['**/*.json'],
			schema: {
				type: 'object',
			}
		},
		{
			uri: 'https://myschemastore/schema2.json',
			fileMatch: ['**/bar.json'],
			schema: {
				type: 'object',
			}
		},
		{
			uri: 'https://myschemastore/schema3.json',
			schema: {
				type: 'object',
			}
		}
		];
		const ls = getLanguageService({ workspaceContext });
		ls.configure({ schemas });

		{
			const { textDoc, jsonDoc } = toDocument('{ }', undefined, 'foo://bar/folder/foo.json');
			const info = ls.getLanguageStatus(textDoc, jsonDoc);
			assert.deepStrictEqual(info.schemas, ['https://myschemastore/schema1.json']);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{ }', undefined, 'foo://bar/folder/bar.json');
			const info = ls.getLanguageStatus(textDoc, jsonDoc);
			assert.deepStrictEqual(info.schemas, ['https://myschemastore/schema1.json', 'https://myschemastore/schema2.json']);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{ $schema: "https://myschemastore/schema3.json" }', undefined, 'foo://bar/folder/bar.json');
			const info = ls.getLanguageStatus(textDoc, jsonDoc);
			assert.deepStrictEqual(info.schemas, ['https://myschemastore/schema3.json']);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{ $schema: "schema3.json" }', undefined, 'foo://bar/folder/bar.json');
			const info = ls.getLanguageStatus(textDoc, jsonDoc);
			assert.deepStrictEqual(info.schemas, ['foo://bar/folder/schema3.json']);
		}
		{
			const { textDoc, jsonDoc } = toDocument('{ $schema: "./schema3.json" }', undefined, 'foo://bar/folder/bar.json');
			const info = ls.getLanguageStatus(textDoc, jsonDoc);
			assert.deepStrictEqual(info.schemas, ['foo://bar/folder/schema3.json']);
		}

	});

	test('access json-schema.org with https', async function () {
		const httpUrl = "http://json-schema.org/schema";
		const httpsUrl = "https://json-schema.org/schema";

		const schemas: { [uri: string]: JSONSchema } = {
			[httpsUrl]: {
				type: 'object',
				properties: {
					bar: {
						const: 3
					}
				}
			}
		};
		const accesses: string[] = [];
		const schemaRequestService = newMockRequestService(schemas, accesses);

		const ls = getLanguageService({ workspaceContext, schemaRequestService });

		const testDoc = toDocument(JSON.stringify({ $schema: httpUrl, bar: 2 }));
		let validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepStrictEqual(validation.map(v => v.message), ['Value must be 3.']);
		assert.deepStrictEqual([httpsUrl], accesses);
	});

	test('combined schemas and URIs without host', async function () {
		const schemas: SchemaConfiguration[] = [{
			uri: 'myproto:///schema.json',
			fileMatch: ['foo.json'],
		},
		{
			uri: 'https://myschemastore/schema2.json',
			fileMatch: ['foo.json'],
		}
		];
		const schemaContents: { [uri: string]: JSONSchema } = {
			['myproto:/schema.json']: {
				type: 'object',
				properties: {
					bar: {
						type: 'string'
					}
				}
			},
			['https://myschemastore/schema2.json']: {
				type: 'object',
				properties: {
					foo: {
						type: 'string'
					}
				}
			}
		};

		const accesses: string[] = [];


		const schemaRequestService: SchemaRequestService = async (uri: string) => {
			if (uri === `https://myschemastore/schema2.json` || uri === `myproto:/schema.json`) {
				return '{}';
			}
			throw new Error('Unknown schema ' + uri);
		};


		const ls = getLanguageService({ workspaceContext, schemaRequestService });
		ls.configure({ schemas });

		{
			const { textDoc, jsonDoc } = toDocument('{ }', undefined, 'foo://bar/folder/foo.json');
			const res = await ls.doValidation(textDoc, jsonDoc);
		}

	});

	test('validate against draft-2019-09', async function () {
		const schema: JSONSchema = {
			$schema: 'https://json-schema.org/draft/2019-09/schema',
			type: 'object',
			properties: {
				name: {
					type: 'string',
					minLength: 4,
				}
			},
			required: ['name']
		};

		const ls = getLanguageService({});
		{
			const { textDoc, jsonDoc } = toDocument(JSON.stringify(schema));
			assert.deepStrictEqual(jsonDoc.syntaxErrors, []);
			const resolveError = await ls.doValidation(textDoc, jsonDoc, { schemaRequest: 'error' });
			assert.deepStrictEqual(resolveError, []);
		}
	});

	test('validate against draft-2020-12', async function () {
		const schema: JSONSchema = {
			$schema: 'https://json-schema.org/draft/2020-12/schema',
			type: 'object',
			properties: {
				name: {
					type: 'string',
					minLength: 4,
				}
			},
			required: ['name']
		};

		const ls = getLanguageService({});
		{
			const { textDoc, jsonDoc } = toDocument(JSON.stringify(schema));
			assert.deepStrictEqual(jsonDoc.syntaxErrors, []);
			const resolveError = await ls.doValidation(textDoc, jsonDoc, { schemaRequest: 'error' });
			assert.deepStrictEqual(resolveError, []);
		}
	});
});
