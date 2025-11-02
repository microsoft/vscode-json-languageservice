/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISchemaContributions } from './jsonSchemaService';
import draft201909Flat from './schemas/draft-2019-09-flat';
import draft202012Flat from './schemas/draft-2020-12-flat';

import * as l10n from '@vscode/l10n';

export const schemaContributions: ISchemaContributions = {
	schemaAssociations: [],
	schemas: {
		// bundle the schema-schema to include (localized) descriptions
		'https://json-schema.org/draft-04/schema': {
			'definitions': {
				'schemaArray': {
					'type': 'array',
					'minItems': 1,
					'items': {
						'$ref': '#'
					}
				},
				'positiveInteger': {
					'type': 'integer',
					'minimum': 0
				},
				'positiveIntegerDefault0': {
					'allOf': [
						{
							'$ref': '#/definitions/positiveInteger'
						},
						{
							'default': 0
						}
					]
				},
				'simpleTypes': {
					'type': 'string',
					'enum': [
						'array',
						'boolean',
						'integer',
						'null',
						'number',
						'object',
						'string'
					]
				},
				'stringArray': {
					'type': 'array',
					'items': {
						'type': 'string'
					},
					'minItems': 1,
					'uniqueItems': true
				}
			},
			'type': 'object',
			'properties': {
				'id': {
					'type': 'string',
					'format': 'uri'
				},
				'$schema': {
					'type': 'string',
					'format': 'uri'
				},
				'title': {
					'type': 'string'
				},
				'description': {
					'type': 'string'
				},
				'default': {},
				'multipleOf': {
					'type': 'number',
					'minimum': 0,
					'exclusiveMinimum': true
				},
				'maximum': {
					'type': 'number'
				},
				'exclusiveMaximum': {
					'type': 'boolean',
					'default': false
				},
				'minimum': {
					'type': 'number'
				},
				'exclusiveMinimum': {
					'type': 'boolean',
					'default': false
				},
				'maxLength': {
					'allOf': [
						{
							'$ref': '#/definitions/positiveInteger'
						}
					]
				},
				'minLength': {
					'allOf': [
						{
							'$ref': '#/definitions/positiveIntegerDefault0'
						}
					]
				},
				'pattern': {
					'type': 'string',
					'format': 'regex'
				},
				'additionalItems': {
					'anyOf': [
						{
							'type': 'boolean'
						},
						{
							'$ref': '#'
						}
					],
					'default': {}
				},
				'items': {
					'anyOf': [
						{
							'$ref': '#'
						},
						{
							'$ref': '#/definitions/schemaArray'
						}
					],
					'default': {}
				},
				'maxItems': {
					'allOf': [
						{
							'$ref': '#/definitions/positiveInteger'
						}
					]
				},
				'minItems': {
					'allOf': [
						{
							'$ref': '#/definitions/positiveIntegerDefault0'
						}
					]
				},
				'uniqueItems': {
					'type': 'boolean',
					'default': false
				},
				'maxProperties': {
					'allOf': [
						{
							'$ref': '#/definitions/positiveInteger'
						}
					]
				},
				'minProperties': {
					'allOf': [
						{
							'$ref': '#/definitions/positiveIntegerDefault0'
						}
					]
				},
				'required': {
					'allOf': [
						{
							'$ref': '#/definitions/stringArray'
						}
					]
				},
				'additionalProperties': {
					'anyOf': [
						{
							'type': 'boolean'
						},
						{
							'$ref': '#'
						}
					],
					'default': {}
				},
				'definitions': {
					'type': 'object',
					'additionalProperties': {
						'$ref': '#'
					},
					'default': {}
				},
				'properties': {
					'type': 'object',
					'additionalProperties': {
						'$ref': '#'
					},
					'default': {}
				},
				'patternProperties': {
					'type': 'object',
					'additionalProperties': {
						'$ref': '#'
					},
					'default': {}
				},
				'dependencies': {
					'type': 'object',
					'additionalProperties': {
						'anyOf': [
							{
								'$ref': '#'
							},
							{
								'$ref': '#/definitions/stringArray'
							}
						]
					}
				},
				'enum': {
					'type': 'array',
					'minItems': 1,
					'uniqueItems': true
				},
				'type': {
					'anyOf': [
						{
							'$ref': '#/definitions/simpleTypes'
						},
						{
							'type': 'array',
							'items': {
								'$ref': '#/definitions/simpleTypes'
							},
							'minItems': 1,
							'uniqueItems': true
						}
					]
				},
				'format': {
					'anyOf': [
						{
							'type': 'string',
							'enum': [
								'date-time',
								'uri',
								'email',
								'hostname',
								'ipv4',
								'ipv6',
								'regex'
							]
						},
						{
							'type': 'string'
						}
					]
				},
				'allOf': {
					'allOf': [
						{
							'$ref': '#/definitions/schemaArray'
						}
					]
				},
				'anyOf': {
					'allOf': [
						{
							'$ref': '#/definitions/schemaArray'
						}
					]
				},
				'oneOf': {
					'allOf': [
						{
							'$ref': '#/definitions/schemaArray'
						}
					]
				},
				'not': {
					'allOf': [
						{
							'$ref': '#'
						}
					]
				}
			},
			'dependencies': {
				'exclusiveMaximum': [
					'maximum'
				],
				'exclusiveMinimum': [
					'minimum'
				]
			},
			'default': {}
		},
		'https://json-schema.org/draft-07/schema': {
			'definitions': {
				'schemaArray': {
					'type': 'array',
					'minItems': 1,
					'items': { '$ref': '#' }
				},
				'nonNegativeInteger': {
					'type': 'integer',
					'minimum': 0
				},
				'nonNegativeIntegerDefault0': {
					'allOf': [
						{ '$ref': '#/definitions/nonNegativeInteger' },
						{ 'default': 0 }
					]
				},
				'simpleTypes': {
					'enum': [
						'array',
						'boolean',
						'integer',
						'null',
						'number',
						'object',
						'string'
					]
				},
				'stringArray': {
					'type': 'array',
					'items': { 'type': 'string' },
					'uniqueItems': true,
					'default': []
				}
			},
			'type': ['object', 'boolean'],
			'properties': {
				'$id': {
					'type': 'string',
					'format': 'uri-reference'
				},
				'$schema': {
					'type': 'string',
					'format': 'uri'
				},
				'$ref': {
					'type': 'string',
					'format': 'uri-reference'
				},
				'$comment': {
					'type': 'string'
				},
				'title': {
					'type': 'string'
				},
				'description': {
					'type': 'string'
				},
				'default': true,
				'readOnly': {
					'type': 'boolean',
					'default': false
				},
				'examples': {
					'type': 'array',
					'items': true
				},
				'multipleOf': {
					'type': 'number',
					'exclusiveMinimum': 0
				},
				'maximum': {
					'type': 'number'
				},
				'exclusiveMaximum': {
					'type': 'number'
				},
				'minimum': {
					'type': 'number'
				},
				'exclusiveMinimum': {
					'type': 'number'
				},
				'maxLength': { '$ref': '#/definitions/nonNegativeInteger' },
				'minLength': { '$ref': '#/definitions/nonNegativeIntegerDefault0' },
				'pattern': {
					'type': 'string',
					'format': 'regex'
				},
				'additionalItems': { '$ref': '#' },
				'items': {
					'anyOf': [
						{ '$ref': '#' },
						{ '$ref': '#/definitions/schemaArray' }
					],
					'default': true
				},
				'maxItems': { '$ref': '#/definitions/nonNegativeInteger' },
				'minItems': { '$ref': '#/definitions/nonNegativeIntegerDefault0' },
				'uniqueItems': {
					'type': 'boolean',
					'default': false
				},
				'contains': { '$ref': '#' },
				'maxProperties': { '$ref': '#/definitions/nonNegativeInteger' },
				'minProperties': { '$ref': '#/definitions/nonNegativeIntegerDefault0' },
				'required': { '$ref': '#/definitions/stringArray' },
				'additionalProperties': { '$ref': '#' },
				'definitions': {
					'type': 'object',
					'additionalProperties': { '$ref': '#' },
					'default': {}
				},
				'properties': {
					'type': 'object',
					'additionalProperties': { '$ref': '#' },
					'default': {}
				},
				'patternProperties': {
					'type': 'object',
					'additionalProperties': { '$ref': '#' },
					'propertyNames': { 'format': 'regex' },
					'default': {}
				},
				'dependencies': {
					'type': 'object',
					'additionalProperties': {
						'anyOf': [
							{ '$ref': '#' },
							{ '$ref': '#/definitions/stringArray' }
						]
					}
				},
				'propertyNames': { '$ref': '#' },
				'const': true,
				'enum': {
					'type': 'array',
					'items': true,
					'minItems': 1,
					'uniqueItems': true
				},
				'type': {
					'anyOf': [
						{ '$ref': '#/definitions/simpleTypes' },
						{
							'type': 'array',
							'items': { '$ref': '#/definitions/simpleTypes' },
							'minItems': 1,
							'uniqueItems': true
						}
					]
				},
				'format': { 'type': 'string' },
				'contentMediaType': { 'type': 'string' },
				'contentEncoding': { 'type': 'string' },
				'if': { '$ref': '#' },
				'then': { '$ref': '#' },
				'else': { '$ref': '#' },
				'allOf': { '$ref': '#/definitions/schemaArray' },
				'anyOf': { '$ref': '#/definitions/schemaArray' },
				'oneOf': { '$ref': '#/definitions/schemaArray' },
				'not': { '$ref': '#' }
			},
			'default': true
		},
		'https://json-schema.org/draft/2020-12/schema': draft202012Flat,
		'https://json-schema.org/draft/2019-09/schema': draft201909Flat
	}
};
const descriptions: { [prop: string]: string } = {
	id: l10n.t("A unique identifier for the schema."),
	$schema: l10n.t("The schema to verify this document against."),
	title: l10n.t("A descriptive title of the schema."),
	description: l10n.t("A long description of the schema. Used in hover menus and suggestions."),
	default: l10n.t("A default value. Used by suggestions."),
	multipleOf: l10n.t("A number that should cleanly divide the current value (i.e. have no remainder)."),
	maximum: l10n.t("The maximum numerical value, inclusive by default."),
	exclusiveMaximum: l10n.t("Makes the maximum property exclusive."),
	minimum: l10n.t("The minimum numerical value, inclusive by default."),
	exclusiveMinimum: l10n.t("Makes the minimum property exclusive."),
	maxLength: l10n.t("The maximum length of a string."),
	minLength: l10n.t("The minimum length of a string."),
	pattern: l10n.t("A regular expression to match the string against. It is not implicitly anchored."),
	additionalItems: l10n.t("For arrays, only when items is set as an array. If items are a schema, this schema validates items after the ones specified by the items schema. If false, additional items will cause validation to fail."),
	items: l10n.t("For arrays. Can either be a schema to validate every element against or an array of schemas to validate each item against in order (the first schema will validate the first element, the second schema will validate the second element, and so on."),
	maxItems: l10n.t("The maximum number of items that can be inside an array. Inclusive."),
	minItems: l10n.t("The minimum number of items that can be inside an array. Inclusive."),
	uniqueItems: l10n.t("If all of the items in the array must be unique. Defaults to false."),
	maxProperties: l10n.t("The maximum number of properties an object can have. Inclusive."),
	minProperties: l10n.t("The minimum number of properties an object can have. Inclusive."),
	required: l10n.t("An array of strings that lists the names of all properties required on this object."),
	additionalProperties: l10n.t("Either a schema or a boolean. If a schema, used to validate all properties not matched by 'properties', 'propertyNames', or 'patternProperties'. If false, any properties not defined by the adajacent keywords will cause this schema to fail."),
	definitions: l10n.t("Not used for validation. Place subschemas here that you wish to reference inline with $ref."),
	properties: l10n.t("A map of property names to schemas for each property."),
	patternProperties: l10n.t("A map of regular expressions on property names to schemas for matching properties."),
	dependencies: l10n.t("A map of property names to either an array of property names or a schema. An array of property names means the property named in the key depends on the properties in the array being present in the object in order to be valid. If the value is a schema, then the schema is only applied to the object if the property in the key exists on the object."),
	enum: l10n.t("The set of literal values that are valid."),
	type: l10n.t("Either a string of one of the basic schema types (number, integer, null, array, object, boolean, string) or an array of strings specifying a subset of those types."),
	format: l10n.t("Describes the format expected for the value. By default, not used for validation"),
	allOf: l10n.t("An array of schemas, all of which must match."),
	anyOf: l10n.t("An array of schemas, where at least one must match."),
	oneOf: l10n.t("An array of schemas, exactly one of which must match."),
	not: l10n.t("A schema which must not match."),
	$id: l10n.t("A unique identifier for the schema."),
	$ref: l10n.t("Reference a definition hosted on any location."),
	$comment: l10n.t("Comments from schema authors to readers or maintainers of the schema."),
	readOnly: l10n.t("Indicates that the value of the instance is managed exclusively by the owning authority."),
	examples: l10n.t("Sample JSON values associated with a particular schema, for the purpose of illustrating usage."),
	contains: l10n.t("An array instance is valid against \"contains\" if at least one of its elements is valid against the given schema."),
	propertyNames: l10n.t("If the instance is an object, this keyword validates if every property name in the instance validates against the provided schema."),
	const: l10n.t("An instance validates successfully against this keyword if its value is equal to the value of the keyword."),
	contentMediaType: l10n.t("Describes the media type of a string property."),
	contentEncoding: l10n.t("Describes the content encoding of a string property."),
	if: l10n.t("The validation outcome of the \"if\" subschema controls which of the \"then\" or \"else\" keywords are evaluated."),
	then: l10n.t("The \"then\" subschema is used for validation when the \"if\" subschema succeeds."),
	else: l10n.t("The \"else\" subschema is used for validation when the \"if\" subschema fails.")
};

for (const schemaName in schemaContributions.schemas) {
	const schema = schemaContributions.schemas[schemaName];
	for (const property in schema.properties) {
		let propertyObject = schema.properties[property];
		if (typeof propertyObject === 'boolean') {
			propertyObject = schema.properties[property] = {};
		}
		const description = descriptions[property];
		if (description) {
			propertyObject['description'] = description;
		}
	}
}