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
	$anchor?: string;
	$recursiveRef?: string;
	$recursiveAnchor?: boolean;
	$vocabulary?: { [uri: string]: boolean };

	// schema 2020-12
	prefixItems?: JSONSchemaRef[];
	$dynamicRef?: string;
	$dynamicAnchor?: string;

	// VSCode extensions

	defaultSnippets?: { label?: string; description?: string; markdownDescription?: string; body?: any; bodyText?: string; }[]; // VSCode extension: body: a object that will be converted to a JSON string. bodyText: text with \t and \n
	errorMessage?: string; // VSCode extension
	patternErrorMessage?: string; // VSCode extension
	deprecationMessage?: string; // VSCode extension
	enumDescriptions?: string[]; // VSCode extension
	enumSortTexts?: string[]; // VSCode extension
	enumDetails?: string[]; // VSCode extension
	markdownEnumDescriptions?: string[]; // VSCode extension
	markdownDescription?: string; // VSCode extension
	doNotSuggest?: boolean; // VSCode extension
	suggestSortText?: string;  // VSCode extension
	allowComments?: boolean; // VSCode extension
	allowTrailingCommas?: boolean; // VSCode extension
	completionDetail?: string; // VSCode extension
}

export interface JSONSchemaMap {
	[name: string]: JSONSchemaRef;
}

/**
 * Internal extension of {@link JSONSchema} used when one schema is merged into
 * another (e.g. when resolving `$ref`). The `$originalId` field preserves the
 * `$id`/`id` of the referenced schema so features like `$recursiveRef` can
 * still identify schema resource roots after the merge.
 *
 * `$originalId` is set as a non-enumerable property to keep it out of
 * `for..in` iteration and JSON serialization.
 */
export interface MergedJSONSchema extends JSONSchema {
	$originalId?: string;

	/**
	 * Non-enumerable metadata attached to a `$dynamicRef` node while resolving it.
	 * Held off the enumerable keywords so it stays invisible to schema traversal,
	 * merging and consumers, but available to the validator.
	 */
	$dynamicRefInfo?: DynamicRefInfo;

	/**
	 * Non-enumerable per-resource anchor maps, attached to resource-root schemas
	 * (a node with its own `$id`, or the document root) for 2020-12 `$dynamicRef`
	 * resolution.
	 */
	$anchorMaps?: AnchorMaps;
}

/**
 * Internal, non-enumerable metadata recorded for a single `$dynamicRef` occurrence.
 */
export interface DynamicRefInfo {
	/**
	 * The statically resolved initial target (resolved like a plain `$ref`, against
	 * the reference's own base URI).
	 */
	target?: JSONSchema;

	/**
	 * The plain-name fragment of the `$dynamicRef` (set whenever the fragment is a
	 * plain name rather than a JSON pointer). The validator uses it, together with
	 * the initial target, to decide at validation time whether the 2020-12
	 * "bookending" requirement holds (i.e. the initial target is a `$dynamicAnchor`
	 * of that name) and therefore whether to perform dynamic-scope resolution
	 * instead of behaving like a plain `$ref`.
	 */
	name?: string;

	/**
	 * The schema resource (nearest enclosing `$id` scope) that lexically contains
	 * the `$dynamicRef`. Recorded before `$ref` merging flattens resource
	 * boundaries so an internal `#name` reference resolves against its own
	 * resource's anchors, not a sibling's.
	 */
	scope?: MergedJSONSchema;
}

/**
 * Internal, non-enumerable per-resource anchor maps used for 2020-12 `$dynamicRef`
 * resolution. Attached to resource-root schemas.
 */
export interface AnchorMaps {
	/**
	 * `$dynamicAnchor` names → sub-schemas within the resource, used by the
	 * validator to walk the dynamic scope (outermost resource first).
	 */
	dynamic: Map<string, JSONSchema>;

	/**
	 * Both `$anchor` and `$dynamicAnchor` names → sub-schemas within the resource,
	 * used to resolve an internal `$dynamicRef`'s initial target within its own
	 * resource.
	 */
	local: Map<string, JSONSchema>;
}
