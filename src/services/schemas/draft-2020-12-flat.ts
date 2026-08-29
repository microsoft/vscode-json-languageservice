/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This file is generated - do not edit directly!
// Derived from https://json-schema.org/draft/2020-12

export default {
	$id: 'https://json-schema.org/draft/2020-12/schema',
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	title: '(Flattened static) Core and Validation specifications meta-schema',
	type: [
		'object',
		'boolean',
	],
	properties: {
		definitions: {
			$comment: 'While no longer an official keyword as it is replaced by $defs, this keyword is retained in the meta-schema to prevent incompatible extensions as it remains in common use.',
			type: 'object',
			additionalProperties: {
				$ref: '#',
			},
			default: {
			},
		},
		dependencies: {
			$comment: '"dependencies" is no longer a keyword, but schema authors should avoid redefining it to facilitate a smooth transition to "dependentSchemas" and "dependentRequired"',
			type: 'object',
			additionalProperties: {
				anyOf: [
					{
						$ref: '#',
					},
					{
						$ref: '#/$defs/stringArray',
					},
				],
			},
		},
		$id: {
			type: 'string',
			format: 'uri-reference',
			$comment: 'Non-empty fragments not allowed.',
			pattern: '^[^#]*#?$',
		},
		$schema: {
			type: 'string',
			format: 'uri',
		},
		$anchor: {
			type: 'string',
			pattern: '^[A-Za-z_][-A-Za-z0-9._]*$',
		},
		$ref: {
			type: 'string',
			format: 'uri-reference',
		},
		$dynamicRef: {
			type: 'string',
			format: 'uri-reference',
		},
		$vocabulary: {
			type: 'object',
			propertyNames: {
				type: 'string',
				format: 'uri',
			},
			additionalProperties: {
				type: 'boolean',
			},
		},
		$comment: {
			type: 'string',
		},
		$defs: {
			type: 'object',
			additionalProperties: {
				$ref: '#',
			},
			default: {
			},
		},
		prefixItems: {
			$ref: '#/$defs/schemaArray',
		},
		items: {
			$ref: '#',
		},
		contains: {
			$ref: '#',
		},
		additionalProperties: {
			$ref: '#',
		},
		properties: {
			type: 'object',
			additionalProperties: {
				$ref: '#',
			},
			default: {
			},
		},
		patternProperties: {
			type: 'object',
			additionalProperties: {
				$ref: '#',
			},
			propertyNames: {
				format: 'regex',
			},
			default: {
			},
		},
		dependentSchemas: {
			type: 'object',
			additionalProperties: {
				$ref: '#',
			},
		},
		propertyNames: {
			$ref: '#',
		},
		if: {
			$ref: '#',
		},
		then: {
			$ref: '#',
		},
		else: {
			$ref: '#',
		},
		allOf: {
			$ref: '#/$defs/schemaArray',
		},
		anyOf: {
			$ref: '#/$defs/schemaArray',
		},
		oneOf: {
			$ref: '#/$defs/schemaArray',
		},
		not: {
			$ref: '#',
		},
		unevaluatedItems: {
			$ref: '#',
		},
		unevaluatedProperties: {
			$ref: '#',
		},
		multipleOf: {
			type: 'number',
			exclusiveMinimum: 0,
		},
		maximum: {
			type: 'number',
		},
		exclusiveMaximum: {
			type: 'number',
		},
		minimum: {
			type: 'number',
		},
		exclusiveMinimum: {
			type: 'number',
		},
		maxLength: {
			$ref: '#/$defs/nonNegativeInteger',
		},
		minLength: {
			$ref: '#/$defs/nonNegativeIntegerDefault0',
		},
		pattern: {
			type: 'string',
			format: 'regex',
		},
		maxItems: {
			$ref: '#/$defs/nonNegativeInteger',
		},
		minItems: {
			$ref: '#/$defs/nonNegativeIntegerDefault0',
		},
		uniqueItems: {
			type: 'boolean',
			default: false,
		},
		maxContains: {
			$ref: '#/$defs/nonNegativeInteger',
		},
		minContains: {
			$ref: '#/$defs/nonNegativeInteger',
			default: 1,
		},
		maxProperties: {
			$ref: '#/$defs/nonNegativeInteger',
		},
		minProperties: {
			$ref: '#/$defs/nonNegativeIntegerDefault0',
		},
		required: {
			$ref: '#/$defs/stringArray',
		},
		dependentRequired: {
			type: 'object',
			additionalProperties: {
				$ref: '#/$defs/stringArray',
			},
		},
		const: true,
		enum: {
			type: 'array',
			items: true,
		},
		type: {
			anyOf: [
				{
					$ref: '#/$defs/simpleTypes',
				},
				{
					type: 'array',
					items: {
						$ref: '#/$defs/simpleTypes',
					},
					minItems: 1,
					uniqueItems: true,
				},
			],
		},
		title: {
			type: 'string',
		},
		description: {
			type: 'string',
		},
		default: true,
		deprecated: {
			type: 'boolean',
			default: false,
		},
		readOnly: {
			type: 'boolean',
			default: false,
		},
		writeOnly: {
			type: 'boolean',
			default: false,
		},
		examples: {
			type: 'array',
			items: true,
		},
		format: {
			type: 'string',
		},
		contentMediaType: {
			type: 'string',
		},
		contentEncoding: {
			type: 'string',
		},
		contentSchema: {
			$ref: '#',
		},
	},
	$defs: {
		schemaArray: {
			type: 'array',
			minItems: 1,
			items: {
				$ref: '#',
			},
		},
		nonNegativeInteger: {
			type: 'integer',
			minimum: 0,
		},
		nonNegativeIntegerDefault0: {
			$ref: '#/$defs/nonNegativeInteger',
			default: 0,
		},
		simpleTypes: {
			enum: [
				'array',
				'boolean',
				'integer',
				'null',
				'number',
				'object',
				'string',
			],
		},
		stringArray: {
			type: 'array',
			items: {
				type: 'string',
			},
			uniqueItems: true,
			default: [
			],
		},
	},
}