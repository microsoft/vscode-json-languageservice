/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SchemaDraft } from '../jsonLanguageTypes.js';

const CORE_201909 = 'https://json-schema.org/draft/2019-09/vocab/core';
const CORE_202012 = 'https://json-schema.org/draft/2020-12/vocab/core';

const vocabularyKeywords: { [uri: string]: string[] } = {
	[CORE_201909]: [
		'$id', '$schema', '$ref', '$anchor', '$recursiveRef',
		'$recursiveAnchor', '$defs', '$comment', '$vocabulary'
	],
	'https://json-schema.org/draft/2019-09/vocab/applicator': [
		'prefixItems', 'items', 'contains', 'additionalProperties',
		'properties', 'patternProperties', 'dependentSchemas',
		'propertyNames', 'if', 'then', 'else', 'allOf', 'anyOf', 'oneOf', 'not'
	],
	'https://json-schema.org/draft/2019-09/vocab/validation': [
		'type', 'enum', 'const', 'multipleOf', 'maximum', 'exclusiveMaximum',
		'minimum', 'exclusiveMinimum', 'maxLength', 'minLength', 'pattern',
		'maxItems', 'minItems', 'uniqueItems', 'maxContains', 'minContains',
		'maxProperties', 'minProperties', 'required', 'dependentRequired'
	],
	'https://json-schema.org/draft/2019-09/vocab/meta-data': [
		'title', 'description', 'default', 'deprecated',
		'readOnly', 'writeOnly', 'examples'
	],
	'https://json-schema.org/draft/2019-09/vocab/format': [
		'format'
	],
	'https://json-schema.org/draft/2019-09/vocab/content': [
		'contentEncoding', 'contentMediaType', 'contentSchema'
	],
	[CORE_202012]: [
		'$id', '$schema', '$ref', '$anchor', '$dynamicRef',
		'$dynamicAnchor', '$defs', '$comment', '$vocabulary'
	],
	'https://json-schema.org/draft/2020-12/vocab/applicator': [
		'prefixItems', 'items', 'contains', 'additionalProperties',
		'properties', 'patternProperties', 'dependentSchemas',
		'propertyNames', 'if', 'then', 'else', 'allOf', 'anyOf', 'oneOf', 'not'
	],
	'https://json-schema.org/draft/2020-12/vocab/unevaluated': [
		'unevaluatedItems', 'unevaluatedProperties'
	],
	'https://json-schema.org/draft/2020-12/vocab/validation': [
		'type', 'enum', 'const', 'multipleOf', 'maximum', 'exclusiveMaximum',
		'minimum', 'exclusiveMinimum', 'maxLength', 'minLength', 'pattern',
		'maxItems', 'minItems', 'uniqueItems', 'maxContains', 'minContains',
		'maxProperties', 'minProperties', 'required', 'dependentRequired'
	],
	'https://json-schema.org/draft/2020-12/vocab/meta-data': [
		'title', 'description', 'default', 'deprecated',
		'readOnly', 'writeOnly', 'examples'
	],
	'https://json-schema.org/draft/2020-12/vocab/format-annotation': [
		'format'
	],
	'https://json-schema.org/draft/2020-12/vocab/format-assertion': [
		'format'
	],
	'https://json-schema.org/draft/2020-12/vocab/content': [
		'contentEncoding', 'contentMediaType', 'contentSchema'
	]
};

function buildVocabulariesByKeyword(): Map<string, Set<string>> {
	const byKeyword = new Map<string, Set<string>>();
	for (const [vocabUri, keywords] of Object.entries(vocabularyKeywords)) {
		for (const keyword of keywords) {
			let definingVocabularies = byKeyword.get(keyword);
			if (!definingVocabularies) {
				definingVocabularies = new Set<string>();
				byKeyword.set(keyword, definingVocabularies);
			}
			definingVocabularies.add(vocabUri);
		}
	}
	return byKeyword;
}

/*
 * Reverse index of `vocabularyKeywords`: for each keyword, the vocabulary URIs
 * that define it. Several keywords are defined by more than one vocabulary -
 * `format` belongs to the 2019-09 format vocabulary and to both the 2020-12
 * format-annotation and format-assertion vocabularies - so each entry holds a
 * set of URIs rather than a single one.
 *
 * Built once, so that checking a keyword is a lookup rather than a scan over
 * every vocabulary and its keyword list.
 */
const vocabulariesByKeyword = buildVocabulariesByKeyword();

/*
 * Keywords of the core vocabularies, which are always enabled regardless of
 * which vocabularies are active.
 */
const coreKeywords = new Set([...vocabularyKeywords[CORE_201909], ...vocabularyKeywords[CORE_202012]]);

/*
 * Checks if a keyword is enabled based on the active vocabularies.
 * If no vocabulary constraints are present, all keywords are enabled.
 * Core keywords are always enabled regardless of vocabulary settings.
 * 
 * @param keyword The keyword to check (e.g., 'type', 'properties', '$ref')
 * @param activeVocabularies Set of active vocabulary URIs, or undefined if no constraints
 * @returns true if the keyword should be processed, false otherwise
 */
export function isKeywordEnabled(
	keyword: string,
	activeVocabularies?: Map<string, boolean>
): boolean {
	// If no vocabulary constraints, treat all keywords as enabled
	if (!activeVocabularies) {
		return true;
	}

	// Core keywords are always enabled per JSON Schema spec
	if (coreKeywords.has(keyword)) {
		return true;
	}

	// Otherwise the keyword is enabled if any vocabulary defining it is active
	const definingVocabularies = vocabulariesByKeyword.get(keyword);
	if (definingVocabularies) {
		for (const vocabUri of definingVocabularies) {
			if (activeVocabularies.has(vocabUri)) {
				return true;
			}
		}
	}

	// Keyword not defined by any active vocabulary - disable it
	return false;
}

/*
 * Checks if format validation should produce assertion errors.
 * 
 * According to JSON Schema 2020-12:
 * - format-annotation: format is purely informational, no validation errors
 * - format-assertion: format must be validated and can produce errors
 * 
 * For backwards compatibility:
 * - If no vocabularies are specified and no explicit 2019-09+ draft, format asserts
 * - 2019-09 format vocabulary asserts when required, annotation-only when optional
 * - 2020-12 format-assertion vocabulary asserts
 * - 2020-12 format-annotation vocabulary does not assert
 * 
 * @param activeVocabularies Map of active vocabulary URIs to required flag, or undefined if no constraints
 * @param schemaDraft The explicitly declared schema draft (only set when $schema was present), or undefined
 * @returns true if format validation should produce errors, false if annotation-only
 */
export function isFormatAssertionEnabled(activeVocabularies?: Map<string, boolean>, schemaDraft?: SchemaDraft): boolean {
	// If vocabulary constraints are present, use them to determine format assertion
	if (activeVocabularies && activeVocabularies.size > 0) {
		// 2020-12 format-assertion explicitly enables format validation errors
		if (activeVocabularies.has('https://json-schema.org/draft/2020-12/vocab/format-assertion')) {
			return true;
		}

		// 2019-09 uses the format vocabulary value to control assertions:
		// true enables assertion, false leaves format as annotation-only.
		const format201909 = activeVocabularies.get('https://json-schema.org/draft/2019-09/vocab/format');
		if (format201909 !== undefined) {
			return format201909;
		}

		// 2020-12 format-annotation is annotation-only, no assertion
		if (activeVocabularies.has('https://json-schema.org/draft/2020-12/vocab/format-annotation')) {
			return false;
		}

		// No format vocabulary active - no assertion
		return false;
	}

	// No vocabulary constraints:
	// For explicitly declared 2019-09+ schemas, format is annotation-only by default per spec.
	// For older drafts or no explicit $schema, format asserts for backward compatibility.
	if (schemaDraft !== undefined && schemaDraft >= SchemaDraft.v2019_09) {
		return false;
	}

	return true;
}
