/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface JSONSchema {
	id?: string;
	$schema?: string;
	type?: string | string[];
	title?: string;
	default?: any;
	definitions?: JSONSchemaMap;
	description?: string;
	properties?: JSONSchemaMap;
	patternProperties?: JSONSchemaMap;
	additionalProperties?: boolean | JSONSchema;
	minProperties?: number;
	maxProperties?: number;
	dependencies?: JSONSchemaMap | { [prop:string]: string[]};
	items?: JSONSchema | JSONSchema[];
	minItems?: number;
	maxItems?: number;
	uniqueItems?: boolean;
	additionalItems?: boolean | JSONSchema;
	pattern?: string;
	minLength?: number;
	maxLength?: number;
	minimum?: number;
	maximum?: number;
	exclusiveMinimum?: boolean;
	exclusiveMaximum?: boolean;
	multipleOf?: number;
	required?: string[];
	$ref?: string;
	anyOf?: JSONSchema[];
	allOf?: JSONSchema[];
	oneOf?: JSONSchema[];
	not?: JSONSchema;
	enum?: any[];
	format?: string;

	// schema draft 06
	const?: any;
	contains?: JSONSchema;

	// VSCode extensions

	defaultSnippets?: { label?: string; description?: string; body?: any; bodyText?: string; }[]; // VSCode extension: body: a object that will be converted to a JSON string. bodyText: text with \t and \n
	errorMessage?: string; // VSCode extension
	patternErrorMessage?: string; // VSCode extension
	deprecationMessage?: string; // VSCode extension
	enumDescriptions?: string[]; // VSCode extension
	markdownEnumDescriptions?: string[]; // VSCode extension
	markdownDescription?: string; // VSCode extension
	doNotSuggest?: boolean; // VSCode extension
}

export interface JSONSchemaMap {
	[name: string]:JSONSchema;
}
