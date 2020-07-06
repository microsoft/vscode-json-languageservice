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

function toDocument(text: string, config?: Parser.JSONDocumentConfig): { textDoc: TextDocument, jsonDoc: Parser.JSONDocument } {
	const textDoc = TextDocument.create('foo://bar/file.json', 'json', 0, text);
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

		return (uri: string): Promise<string> => {
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
				return new Promise<string>((c, e) => {
					const fixturePath = path.join(__dirname, '../../../src/test/fixtures', fileName);
					fs.readFile(fixturePath, 'UTF-8', (err, result) => {
						err ? e("Resource not found") : c(result.toString());
					});
				});
			}
			return Promise.reject<string>("Resource not found");
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

		return service.getResolvedSchema('https://myschemastore/main').then(fs => {
			assert.deepEqual(fs?.schema.properties?.['child'], {
				id: 'https://myschemastore/child',
				type: 'bool',
				description: 'Test description'
			});
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

		return service.getResolvedSchema('http://json.schemastore.org/swagger-2.0').then(fs => {
			assert.deepEqual(fs?.schema.properties?.['responseValue'], {
				type: 'object',
				required: ["$ref"],
				properties: { $ref: { type: 'string' } }
			});
		});

	});

	test('Resolving $refs 3', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/schema1.json',
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

		return service.getResolvedSchema('https://myschemastore/main/schema1.json').then(fs => {
			assert.deepEqual(fs?.schema.properties?.['p1'], {
				type: 'string',
				enum: ["object"]
			});
			assert.deepEqual(fs?.schema.properties?.['p2'], {
				type: 'string',
				enum: ["object"]
			});
			assert.deepEqual(fs?.schema.properties?.['p3'], {
				type: 'string',
				enum: ["object"]
			});
		});

	});

	test('Resolving $refs 3', async function () {
		const service = new SchemaService.JSONSchemaService(newMockRequestService(), workspaceContext);
		service.setSchemaContributions({
			schemas: {
				"https://myschemastore/main/schema1.json": {
					id: 'https://myschemastore/schema1.json',
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

		return service.getResolvedSchema('https://myschemastore/main/schema1.json').then(fs => {
			assert.deepEqual(fs?.schema.properties?.['p1'], {
				type: 'string',
				enum: ["object"]
			});
			assert.deepEqual(fs?.schema.properties?.['p2'], {
				type: 'string',
				enum: ["object"]
			});
			assert.deepEqual(fs?.schema.properties?.['p3'], {
				type: 'string',
				enum: ["object"]
			});
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

		return service.getResolvedSchema('test://schemas/main').then(fs => {
			const section = fs?.getSection(['child', 'grandchild']);
			assert.equal(section?.description, 'Meaning of Life');
		});
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

		return service.getResolvedSchema('test://schemas/main').then(fs => {
			const section = fs?.getSection(['child', '0', 'grandchild']);
			assert.equal(section?.description, 'Meaning of Life');
		});
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

		return service.getResolvedSchema('test://schemas/main').then(fs => {
			const section = fs?.getSection(['child', 'grandchild']);
			assert.strictEqual(section, undefined);
		});
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

		service.registerExternalSchema(id, ['*.json'], schema);

		return service.getSchemaForResource('test.json').then((schema) => {
			const section = schema?.getSection(['child', 'grandchild']);
			assert.equal(section?.description, 'Meaning of Life');
		});
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

		service.registerExternalSchema(id1, ['*.json'], schema1);
		service.registerExternalSchema(id2, ['test.json'], schema2);

		return service.getSchemaForResource('test.json').then(schema => {
			const { textDoc, jsonDoc } = toDocument(JSON.stringify({ foo: true, bar: true }));
			const problems = jsonDoc.validate(textDoc, schema?.schema);
			assert.equal(problems?.length, 2);
		});
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

		service.registerExternalSchema(id, ['*.json'], schema);

		return service.getSchemaForResource('test.json').then(schema => {
			const section = schema?.getSection(['child', 'grandchild']);
			assert.equal(section?.description, 'Meaning of Life');
		});
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

		service.registerExternalSchema(id, ['*.json'], schema);

		return service.getSchemaForResource('test.json').then(fs => {
			const section = fs?.getSection(['child', '0', 'grandchild']);
			assert.equal(section?.description, 'Meaning of Life');
		});
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

		const fsm = service.registerExternalSchema(id, ['*.json'], schema);
		return fsm.getResolvedSchema().then((fs) => {
			const section = fs.getSection(['child', '0', 'grandchild']);
			assert.equal(section?.description, 'Meaning of Life');
		});
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

		service.registerExternalSchema(id1, ['test.json', 'bar.json'], schema1);

		return service.getSchemaForResource('test.json').then(schema => {
			const section = schema?.getSection(['child']);
			assert.equal(section?.type, 'number');

			service.clearExternalSchemas();

			service.registerExternalSchema(id2, ['*.json'], schema2);

			return service.getSchemaForResource('test.json').then(schema => {
				const section = schema?.getSection(['child']);
				assert.equal(section?.type, 'string');
			});
		});
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

		service.registerExternalSchema(id2, undefined, schema2);

		return service.getSchemaForResource('main.bar').then(resolvedSchema => {
			assert.deepEqual(resolvedSchema?.errors, []);
			assert.equal(2, resolvedSchema?.schema.allOf?.length);

			service.clearExternalSchemas();
			return service.getSchemaForResource('main.bar').then(resolvedSchema => {
				assert.equal(resolvedSchema?.errors.length, 1);
				assert.equal(resolvedSchema?.errors[0], "Problems loading reference 'http://myschemastore/myschemafoo': Unable to load schema from 'http://myschemastore/myschemafoo': Resource not found.");

				service.clearExternalSchemas();
				service.registerExternalSchema(id2, undefined, schema2);
				return service.getSchemaForResource('main.bar').then(resolvedSchema => {
					assert.equal(resolvedSchema?.errors.length, 0);
				});
			});
		});
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

		return service.getSchemaForResource('file://doc/mydoc.json', jsonDoc).then(resolveSchema => {
			assert.deepEqual(resolveSchema?.errors, []);

			const content = JSON.stringify(resolveSchema?.schema);
			assert.equal(content.indexOf('$ref'), -1); // no more $refs

			const problems = jsonDoc.validate(textDoc, resolveSchema?.schema);
			assert.deepEqual(problems, []);
		});

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

		return service.getSchemaForResource('file://doc/mydoc.json', jsonDoc).then(resolveSchema => {
			assert.deepEqual(resolveSchema?.errors, []);

			const content = JSON.stringify(resolveSchema?.schema);
			assert.equal(content.indexOf('$ref'), -1); // no more $refs

			const problems = jsonDoc.validate(textDoc, resolveSchema?.schema);
			assert.equal(problems?.length, 1);
		});

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

		const fsm0 = service.registerExternalSchema(id0, ['*.json'], schema0);
		const fsm1 = service.registerExternalSchema(id1, [], schema1);
		return fsm0.getResolvedSchema().then((fs0) => {
			assert.equal((<JSONSchema>fs0?.schema.allOf?.[0]).type, 'object');
		});

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
							$ref: '#definitions/shellConfiguration',
							type: 'object'
						},
						hop1: {
							$ref: '#definitions/hop2',
						},
						hop2: {
							$ref: '#definitions/hop1',
							type: 'object'
						}
					}
				}
			}
		});

		return service.getResolvedSchema('https://myschemastore/main').then(fs => {
			assert.deepEqual(fs?.schema.properties?.['responseValue'], {
				type: 'object'
			});
			assert.deepEqual(fs?.schema.properties?.['hops'], {
				type: 'object'
			});
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

		const fsm0 = service.registerExternalSchema(id0, ['*.json'], schema);
		return fsm0.getResolvedSchema().then((fs0) => {
			assert.deepEqual(fs0.errors, []);
			assert.equal((<JSONSchema>fs0?.schema.properties?.p2).type, 'object');
		});

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

		return service.getSchemaForResource('file://doc/mydoc.json', jsonDoc).then(resolvedSchema => {
			assert.deepEqual(resolvedSchema?.errors, []);

			const problems = jsonDoc.validate(textDoc, resolvedSchema?.schema);

			assert.equal(problems?.length, 1);
			assert.equal(problems?.[0].message, 'Missing property "computerName".');
		});

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

		assert.equal(problems?.length, 0);


	});

	test('clearSchema', async function () {
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
		assert.deepEqual(validation.map(v => v.message), ['Incorrect type. Expected "string".']);
		assert.deepEqual([mainSchemaURI, aSchemaURI1], accesses); // b in not loaded as it is not references

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
		assert.deepEqual(validation.map(v => v.message), ['Incorrect type. Expected "boolean".']);
		assert.deepEqual([mainSchemaURI, aSchemaURI1, bSchemaURI1], accesses); // main, a and b are loaded

		// change to be but no reset

		schemas[bSchemaURI1] = {
			type: 'number'
		};

		accesses.length = 0;

		validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepEqual(validation.map(v => v.message), ['Incorrect type. Expected "boolean".']);
		assert.deepEqual([], accesses); // no loades as there was no reset

		// do the reset
		ls.resetSchema(bSchemaURI1);

		validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepEqual(validation.map(v => v.message), []);
		assert.deepEqual([mainSchemaURI, aSchemaURI1, bSchemaURI1], accesses); // main, a and b are loaded, main, a depend on b

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
		assert.deepEqual(validation.map(v => v.message), ['Incorrect type. Expected "boolean".']);
		assert.deepEqual([mainSchemaURI, aSchemaURI1], accesses);


		accesses.length = 0;
		ls.resetSchema(bSchemaURI1);

		validation = await ls.doValidation(testDoc.textDoc, testDoc.jsonDoc);
		assert.deepEqual(validation.map(v => v.message), ['Incorrect type. Expected "boolean".']);
		assert.deepEqual([], accesses); // b is not depended anymore
	});

	test('getMatchingSchemas', async function () {

		const schema: JSONSchema = {
			type: 'object',
			$comment: 'schema',
			properties: {
				foo: {
					type: 'object',
					$comment: 'foo',
					properties: {
						bar: {
							type: 'number',
							$comment: 'bar',
						}
					}
				}
			}
		};

		const ls = getLanguageService({ workspaceContext });

		const testDoc = toDocument(JSON.stringify({ foo: { bar: 1 } }));
		const ms = await ls.getMatchingSchemas(testDoc.textDoc, testDoc.jsonDoc, schema);

		function assertMatchingSchema(ms: MatchingSchema[], nodeOffset: number, comment: string) {
			for (const m of ms) {
				if (m.node.offset === nodeOffset) {
					assert.equal(m.schema.$comment, comment);
					return;
				}
			}
			assert.fail("No node at offset " + nodeOffset);
		}
		assertMatchingSchema(ms, 0, 'schema');
		assertMatchingSchema(ms, 7, 'foo');
		assertMatchingSchema(ms, 14, 'bar');
	});

});
