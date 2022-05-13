/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
export type JSONSchemaRef = JSONSchema | boolean;

export interface JSONSchema {
	id?: string;
	$id?: string;
	$schema?: string;
	type?: string | string[];
	title?: string;
	default?: any;
	definitions?: { [name: string]: JSONSchema };
	description?: string;
	properties?: JSONSchemaMap;
	patternProperties?: JSONSchemaMap;
	additionalProperties?: JSONSchemaRef;
	minProperties?: number;
	maxProperties?: number;
	dependencies?: JSONSchemaMap | { [prop: string]: string[] };
	items?: JSONSchemaRef | JSONSchemaRef[];
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	additionalItems?: JSONSchemaRef;
	pattern?: string;
	minLength?: number;
	maxLength?: number;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: boolean | number;
	exclusiveMaximum?: boolean | number;
	multipleOf?: number;
	required?: string[];
	$ref?: string;
	anyOf?: JSONSchemaRef[];
	allOf?: JSONSchemaRef[];
	oneOf?: JSONSchemaRef[];
	not?: JSONSchemaRef;
	enum?: any[];
	format?: string;

	// schema draft 06
	const?: any;
	contains?: JSONSchemaRef;
	propertyNames?: JSONSchemaRef;
	examples?: any[];

	// schema draft 07
	$comment?: string;
	if?: JSONSchemaRef;
	then?: JSONSchemaRef;
	else?: JSONSchemaRef;

	// schema 2019-09
	unevaluatedProperties?: boolean | JSONSchemaRef;
	unevaluatedItems?: boolean | JSONSchemaRef;
	minContains?: number;
	maxContains?: number;
	deprecated?: boolean;
	dependentRequired?: { [prop: string]: string[] };
	dependentSchemas?: JSONSchemaMap;
	$defs?: { [name: string]: JSONSchema };

	// schema 2020-12
	prefixItems?: JSONSchemaRef[];

	// VSCode extensions

	defaultSnippets?: { label?: string; description?: string; markdownDescription?: string; body?: any; bodyText?: string; }[]; // VSCode extension: body: a object that will be converted to a JSON string. bodyText: text with \t and \n
	errorMessage?: string; // VSCode extension
	patternErrorMessage?: string; // VSCode extension
	deprecationMessage?: string; // VSCode extension
	enumDescriptions?: string[]; // VSCode extension
	markdownEnumDescriptions?: string[]; // VSCode extension
	markdownDescription?: string; // VSCode extension
	doNotSuggest?: boolean; // VSCode extension
	suggestSortText?: string;  // VSCode extension
	allowComments?: boolean; // VSCode extension
	allowTrailingCommas?: boolean; // VSCode extension
}

export interface JSONSchemaMap {
	[name: string]: JSONSchemaRef;
}
