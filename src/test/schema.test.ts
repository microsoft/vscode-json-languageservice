/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import * as SchemaService from '../services/jsonSchemaService';
import * as JsonSchema from '../jsonSchema';
import * as Parser from '../parser/jsonParser';
import * as fs from 'fs';
import * as url from 'url';
import * as path from 'path';
import { TextDocument } from 'vscode-languageserver-types';

function toDocument(text: string, config?: Parser.JSONDocumentConfig): { textDoc: TextDocument, jsonDoc: Parser.JSONDocument } {
	let textDoc = TextDocument.create('foo://bar/file.json', 'json', 0, text);
	let jsonDoc = Parser.parse(textDoc, config);
	return { textDoc, jsonDoc };
}

suite('JSON Schema', () => {

	let fixureDocuments = {
		'http://schema.management.azure.com/schemas/2015-01-01/deploymentTemplate.json': 'deploymentTemplate.json',
		'http://schema.management.azure.com/schemas/2015-01-01/deploymentParameters.json': 'deploymentParameters.json',
		'http://schema.management.azure.com/schemas/2015-01-01/Microsoft.Authorization.json': 'Microsoft.Authorization.json',
		'http://schema.management.azure.com/schemas/2015-01-01/Microsoft.Resources.json': 'Microsoft.Resources.json',
		'http://schema.management.azure.com/schemas/2014-04-01-preview/Microsoft.Sql.json': 'Microsoft.Sql.json',
		'http://schema.management.azure.com/schemas/2014-06-01/Microsoft.Web.json': 'Microsoft.Web.json',
		'http://schema.management.azure.com/schemas/2014-04-01/SuccessBricks.ClearDB.json': 'SuccessBricks.ClearDB.json',
		'http://schema.management.azure.com/schemas/2015-08-01/Microsoft.Compute.json': 'Microsoft.Compute.json'
	};

	let requestServiceMock = function (uri: string): Promise<string> {
		if (uri.length && uri[uri.length - 1] === '#') {
			uri = uri.substr(0, uri.length - 1);
		}
		let fileName = fixureDocuments[uri];
		if (fileName) {
			return new Promise<string>((c, e) => {
				let fixturePath = path.join(__dirname, '../../../src/test/fixtures', fileName);
				fs.readFile(fixturePath, 'UTF-8', (err, result) => {
					err ? e("Resource not found.") : c(result.toString());
				});
			});
		}
		return Promise.reject<string>("Resource not found.");
	};

	let workspaceContext = {
		resolveRelativePath: (relativePath: string, resource: string) => {
			return url.resolve(resource, relativePath);
		}
	};

	test('Resolving $refs', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
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
			assert.deepEqual(fs.schema.properties['child'], {
				id: 'https://myschemastore/child',
				type: 'bool',
				description: 'Test description'
			});
		});

	});

	test('Resolving $refs 2', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
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
			assert.deepEqual(fs.schema.properties['responseValue'], {
				type: 'object',
				required: ["$ref"],
				properties: { $ref: { type: 'string' } }
			});
		});

	});

	test('Resolving $refs 3', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
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
			assert.deepEqual(fs.schema.properties['p1'], {
				type: 'string',
				enum: ["object"]
			});
			assert.deepEqual(fs.schema.properties['p2'], {
				type: 'string',
				enum: ["object"]
			});
			assert.deepEqual(fs.schema.properties['p3'], {
				type: 'string',
				enum: ["object"]
			});
		});

	});

	test('FileSchema', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"main": {
					id: 'main',
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

		return service.getResolvedSchema('main').then(fs => {
			let section = fs.getSection(['child', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		});
	});

	test('Array FileSchema', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"main": {
					id: 'main',
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

		return service.getResolvedSchema('main').then(fs => {
			let section = fs.getSection(['child', '0', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		});
	});

	test('Missing subschema', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"main": {
					id: 'main',
					type: 'object',
					properties: {
						child: {
							type: 'object'
						}
					}
				}
			}
		});

		return service.getResolvedSchema('main').then(fs => {
			let section = fs.getSection(['child', 'grandchild']);
			assert.strictEqual(section, null);
		});
	});

	test('Preloaded Schema', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		let id = 'https://myschemastore/test1';
		let schema: JsonSchema.JSONSchema = {
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

		return service.getSchemaForResource('test.json', null).then((schema) => {
			let section = schema.getSection(['child', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		});
	});

	test('Multiple matches', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		let id1 = 'https://myschemastore/test1';
		let schema1: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				foo: {
					enum: [1],
				}
			}
		};

		let id2 = 'https://myschemastore/test2';
		let schema2: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				bar: {
					enum: [2],
				}
			}
		};

		service.registerExternalSchema(id1, ['*.json'], schema1);
		service.registerExternalSchema(id2, ['test.json'], schema2);

		return service.getSchemaForResource('test.json', null).then((schema) => {
			let { textDoc, jsonDoc } = toDocument(JSON.stringify({ foo: true, bar: true }));
			let problems = jsonDoc.validate(textDoc, schema.schema);
			assert.equal(problems.length, 2);
		});
	});

	test('External Schema', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		let id = 'https://myschemastore/test1';
		let schema: JsonSchema.JSONSchema = {
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

		return service.getSchemaForResource('test.json', null).then((schema) => {
			let section = schema.getSection(['child', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		});
	});


	test('Resolving in-line $refs', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		let id = 'https://myschemastore/test1';

		let schema: JsonSchema.JSONSchema = {
			id: 'main',
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

		return service.getSchemaForResource('test.json', null).then((fs) => {
			let section = fs.getSection(['child', '0', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		});
	});

	test('Resolving in-line $refs automatically for external schemas', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		let id = 'https://myschemastore/test1';
		let schema: JsonSchema.JSONSchema = {
			id: 'main',
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

		let fsm = service.registerExternalSchema(id, ['*.json'], schema);
		return fsm.getResolvedSchema().then((fs) => {
			let section = fs.getSection(['child', '0', 'grandchild']);
			assert.equal(section.description, 'Meaning of Life');
		});
	});


	test('Clearing External Schemas', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		let id1 = 'http://myschemastore/test1';
		let schema1: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'number'
				}
			}
		};

		let id2 = 'http://myschemastore/test2';
		let schema2: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'string'
				}
			}
		};

		service.registerExternalSchema(id1, ['test.json', 'bar.json'], schema1);

		return service.getSchemaForResource('test.json', null).then((schema) => {
			let section = schema.getSection(['child']);
			assert.equal(section.type, 'number');

			service.clearExternalSchemas();

			service.registerExternalSchema(id2, ['*.json'], schema2);

			return service.getSchemaForResource('test.json', null).then((schema) => {
				let section = schema.getSection(['child']);
				assert.equal(section.type, 'string');
			});
		});
	});

	test('Schema contributions', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		service.setSchemaContributions({
			schemas: {
				"http://myschemastore/myschemabar": {
					id: 'main',
					type: 'object',
					properties: {
						foo: {
							type: 'string'
						}
					}
				}
			}, schemaAssociations: {
				'*.bar': ['http://myschemastore/myschemabar', 'http://myschemastore/myschemafoo']
			}
		});

		let id2 = 'http://myschemastore/myschemafoo';
		let schema2: JsonSchema.JSONSchema = {
			type: 'object',
			properties: {
				child: {
					type: 'string'
				}
			}
		};

		service.registerExternalSchema(id2, null, schema2);

		return service.getSchemaForResource('main.bar', null).then(resolvedSchema => {
			assert.deepEqual(resolvedSchema.errors, []);
			assert.equal(2, resolvedSchema.schema.allOf.length);

			service.clearExternalSchemas();
			return service.getSchemaForResource('main.bar', null).then(resolvedSchema => {
				assert.equal(resolvedSchema.errors.length, 1);
				assert.equal(resolvedSchema.errors[0], "Problems loading reference 'http://myschemastore/myschemafoo': Resource not found.");

				service.clearExternalSchemas();
				service.registerExternalSchema(id2, null, schema2);
				return service.getSchemaForResource('main.bar', null).then(resolvedSchema => {
					assert.equal(resolvedSchema.errors.length, 0);
				});
			});
		});
	});

	test('Resolving circular $refs', async function () {

		let service: SchemaService.IJSONSchemaService = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		let input = {
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

		let { textDoc, jsonDoc } = toDocument(JSON.stringify(input));

		return service.getSchemaForResource('file://doc/mydoc.json', jsonDoc).then(resolveSchema => {
			assert.deepEqual(resolveSchema.errors, []);

			let content = JSON.stringify(resolveSchema.schema);
			assert.equal(content.indexOf('$ref'), -1); // no more $refs

			let problems = jsonDoc.validate(textDoc, resolveSchema.schema);
			assert.deepEqual(problems, []);
		});

	});

	test('Resolving circular $refs, invalid document', async function () {

		let service: SchemaService.IJSONSchemaService = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		let input = {
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

		let { textDoc, jsonDoc } = toDocument(JSON.stringify(input));

		return service.getSchemaForResource('file://doc/mydoc.json', jsonDoc).then(resolveSchema => {
			assert.deepEqual(resolveSchema.errors, []);

			let content = JSON.stringify(resolveSchema.schema);
			assert.equal(content.indexOf('$ref'), -1); // no more $refs

			let problems = jsonDoc.validate(textDoc, resolveSchema.schema);
			assert.equal(problems.length, 1);
		});

	});

	test('$refs in $ref', async function () {
		let service = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);
		let id0 = "foo://bar/bar0";
		let id1 = "foo://bar/bar1";
		let schema0: JsonSchema.JSONSchema = {
			"allOf": [
				{
					$ref: id1
				}
			]
		};
		let schema1: JsonSchema.JSONSchema = {
			$ref: "#/definitions/foo",
			definitions: {
				foo: {
					type: 'object',
				}
			},
		};

		let fsm0 = service.registerExternalSchema(id0, ['*.json'], schema0);
		let fsm1 = service.registerExternalSchema(id1, [], schema1);
		return fsm0.getResolvedSchema().then((fs0) => {
			assert.equal((<JsonSchema.JSONSchema>fs0.schema.allOf[0]).type, 'object');
		});

	});


	test('Validate Azure Resource Definition', async function () {
		let service: SchemaService.IJSONSchemaService = new SchemaService.JSONSchemaService(requestServiceMock, workspaceContext);

		let input = {
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

		let { textDoc, jsonDoc } = toDocument(JSON.stringify(input));

		return service.getSchemaForResource('file://doc/mydoc.json', jsonDoc).then(resolvedSchema => {
			assert.deepEqual(resolvedSchema.errors, []);

			let problems = jsonDoc.validate(textDoc, resolvedSchema.schema);

			assert.equal(problems.length, 1);
			assert.equal(problems[0].message, 'Missing property "computerName".');
		});

	});



	test('Complex enums', function () {

		let input = {
			"group": {
				"kind": "build",
				"isDefault": false
			}
		};

		let schema = {
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

		let { textDoc, jsonDoc } = toDocument(JSON.stringify(input));

		let problems = jsonDoc.validate(textDoc, schema);

		assert.equal(problems.length, 0);


	});
});
