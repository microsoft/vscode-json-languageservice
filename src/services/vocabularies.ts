/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	const vocabularyKeywords: { [uri: string]: string[] } = {
		'https://json-schema.org/draft/2019-09/vocab/core': [
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
		'https://json-schema.org/draft/2020-12/vocab/core': [
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

	// If no vocabulary constraints, treat all keywords as enabled
	if (!activeVocabularies) {
		return true;
	}

	// Check if this keyword belongs to any active vocabulary
	for (const [vocabUri, keywords] of Object.entries(vocabularyKeywords)) {
		if (keywords.includes(keyword) && activeVocabularies.has(vocabUri)) {
			return true;
		}
	}

	// Core keywords are always enabled per JSON Schema spec.
	// Check both 2019-09 and 2020-12 core vocabularies.
	const core201909 = vocabularyKeywords['https://json-schema.org/draft/2019-09/vocab/core'];
	const core202012 = vocabularyKeywords['https://json-schema.org/draft/2020-12/vocab/core'];

	if (core201909.includes(keyword) || core202012.includes(keyword)) {
		return true;
	}

	// Keyword not found in any vocabulary - disable it
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
 * - If no vocabularies are specified, format asserts (pre-2019-09 behavior)
 * - 2019-09 format vocabulary is annotation-only
 * - 2020-12 format-assertion vocabulary asserts
 * - 2020-12 format-annotation vocabulary does not assert
 * 
 * @param activeVocabularies Map of active vocabulary URIs to required flag, or undefined if no constraints
 * @returns true if format validation should produce errors, false if annotation-only
 */
export function isFormatAssertionEnabled(activeVocabularies?: Map<string, boolean>): boolean {
	// If no vocabulary constraints or empty vocabulary map, assert for backward compatibility with older schemas
	if (!activeVocabularies || activeVocabularies.size === 0) {
		return true;
	}

	// 2020-12 format-assertion explicitly enables format validation errors
	if (activeVocabularies.has('https://json-schema.org/draft/2020-12/vocab/format-assertion')) {
		return true;
	}

	// 2019-09 format vocabulary is annotation-only per spec
	if (activeVocabularies.has('https://json-schema.org/draft/2019-09/vocab/format')) {
		return false;
	}

	// 2020-12 format-annotation is annotation-only, no assertion
	if (activeVocabularies.has('https://json-schema.org/draft/2020-12/vocab/format-annotation')) {
		return false;
	}

	// No format vocabulary active - no assertion
	return false;
}
