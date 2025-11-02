/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs').promises;
const Bundler = require("@hyperjump/json-schema-bundle");

(async function () {
	bundle(`https://json-schema.org/draft/2019-09/schema`, 'draft-2019-09', 'https://json-schema.org/draft/2019-09');
	bundle(`https://json-schema.org/draft/2020-12/schema`, 'draft-2020-12', 'https://json-schema.org/draft/2020-12');
}());

async function bundle(uri, filename, derivedURL) {
	const metaSchema = await Bundler.get(uri);
	let bundle = await Bundler.bundle(metaSchema);
	bundle = JSON.parse(JSON.stringify(bundle, null, 2).replace(/"undefined": ""/g, '"$dynamicAnchor": "meta"'));
	fs.writeFile(`./${filename}.json`, JSON.stringify(bundle, null, 2), 'utf8');
	bundle = flattenDraftMetaSchema(bundle);
	const jsified = getCopyright(derivedURL) + 'export default ' + printObject(bundle);
	fs.writeFile(`./${filename}-flat.json`, JSON.stringify(bundle, null, 2), 'utf8');
	fs.writeFile(`./src/services/schemas/${filename}-flat.ts`, jsified, 'utf8');
}
function getCopyright(derivedURL) {
	return [
		'/*---------------------------------------------------------------------------------------------',
		' *  Copyright (c) Microsoft Corporation. All rights reserved.',
		' *  Licensed under the MIT License. See License.txt in the project root for license information.',
		' *--------------------------------------------------------------------------------------------*/',
		'',
		'// This file is generated - do not edit directly!',
		'// Derived from ' + derivedURL,
	].join('\n') + '\n\n';
}


function printLiteral(value) {
	if (typeof value === 'string') {
		return `'${value}'`;
	}
	return value;
}

function printKey(value) {
	if (value.match(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/)) {
		return `${value}`;
	}
	return `'${value}'`;
}

function indent(level) {
	return '\t'.repeat(level);
}

function printObject(obj, indentLevel = 0) {
	const result = [];
	if (Array.isArray(obj)) {
		result.push(`[`);
		for (const item of obj) {
			if (typeof item === 'object' && item !== null) {
				result.push(`${indent(indentLevel + 1)}${printObject(item, indentLevel + 1)},`);
			} else {
				result.push(`${indent(indentLevel + 1)}${printLiteral(item)},`);
			}
		}
		result.push(`${indent(indentLevel)}]`);
		return result.join('\n');
	}
	if (obj === null) {
		result.push(`null`);
		return result.join('\n');
	}

	result.push(`{`);
	for (const [key, value] of Object.entries(obj)) {
		if (typeof value === 'object' && value !== null) {
			result.push(`${indent(indentLevel + 1)}${printKey(key)}: ${printObject(value, indentLevel + 1)},`);
		} else {
			result.push(`${indent(indentLevel + 1)}${printKey(key)}: ${printLiteral(value)},`);
		}
	}
	result.push(`${indent(indentLevel)}}`);
	return result.join('\n');
}
// flatten

const DEFAULT_ANCHOR = 'meta';

function visit(node, callback) {
	if (!node || typeof node !== 'object') return;
	if (Array.isArray(node)) {
		for (const item of node) {
			visit(item, callback);
		}
		return;
	}

	for (const key of Object.keys(node)) {
		callback(node, key);
		visit(node[key], callback);
	}
}

/** Recursively replace $dynamicRef:#meta with $ref:#meta */
function replaceDynamicRefs(node, anchorName = DEFAULT_ANCHOR) {
	visit(node, (n, k) => {
		const v = n[k];
		if (k === '$dynamicRef' && v === '#' + anchorName) {
			n['$ref'] = '#';
			delete n['$dynamicRef'];
		};
	});
}

/** Recursively replace $dynamicRef:#meta with $ref:#meta */
function replaceRecursiveRefs(node, anchorName = DEFAULT_ANCHOR) {
	visit(node, (n, k) => {
		const v = n[k];
		if (k === '$recursiveRef') {
			n['$ref'] = v;
			delete n['$recursiveRef'];
		};
	});
}

/** Replace refs that point to a vocabulary */
function replaceOldRefs(node, anchorName = DEFAULT_ANCHOR) {
	visit(node, (n, k) => {
		const v = n[k];
		if (k === '$ref' && typeof v === 'string' && v.startsWith(anchorName + '/')) {
			const segments = v.split('#');
			if (segments.length === 2) {
				n['$ref'] = `#${segments[1]}`;
			}
		}
	});
}

/** Remove all $dynamicAnchor occurrences (except keep keyword definition property) */
function stripDynamicAnchors(node) {
	visit(node, (n, k) => {
		if (k === '$dynamicAnchor') {
			delete n[k];
		}
	});
}

/** Collect vocabulary object definitions from $defs */
function collectVocabularies(schema) {
	const vocabularies = [];
	const defs = schema.$defs || {};
	for (const [key, value] of Object.entries(defs)) {
		if (value && typeof value === 'object' && !Array.isArray(value) && value.$id && value.$dynamicAnchor === DEFAULT_ANCHOR && value.properties) {
			vocabularies.push(value);
		}
	}
	return vocabularies;
}

/** Merge properties from each vocabulary into root.properties (shallow) */
function mergeVocabularyProperties(root, vocabularies) {
	if (!root.properties) root.properties = {};
	replaceOldRefs(root);
	for (const vocab of vocabularies) {
		for (const [propName, propSchema] of Object.entries(vocab.properties || {})) {
			if (!(propName in root.properties)) {
				root.properties[propName] = propSchema;
			} else {
				// Simple heuristic: if both are objects, attempt shallow merge, else keep existing
				const existing = root.properties[propName];
				if (isPlainObject(existing) && isPlainObject(propSchema)) {
					root.properties[propName] = { ...existing, ...propSchema };
				}
			}
		}
	}
}

function isPlainObject(o) {
	return !!o && typeof o === 'object' && !Array.isArray(o);
}

/** Gather unified $defs from vocab $defs (only specific keys) */
function buildUnifiedDefs(schema, vocabularies) {
	const unified = schema.$defs && !referencesVocabulary(schema.$defs) ? { ...schema.$defs } : {};

	function harvest(defsObj) {
		if (!defsObj || typeof defsObj !== 'object') return;
		for (const [k, v] of Object.entries(defsObj)) {
			if (!(k in unified)) {
				unified[k] = v;
			} else {
				console.warn(`Warning: duplicate definition for key ${k} found while building unified $defs. Keeping the first occurrence.`);
			}
		}
	}

	for (const vocab of vocabularies) harvest(vocab.$defs);

	// Adjust schemaArray items dynamicRef->ref later with global replacement
	return unified;
}

function referencesVocabulary(defs) {
	return Object.keys(defs).some(k => k.startsWith('https://json-schema.org/draft/'));
}

function flattenDraftMetaSchema(original) {
	// Clone to avoid mutating input reference
	const schema = JSON.parse(JSON.stringify(original));

	const anchorName = schema.$dynamicAnchor || DEFAULT_ANCHOR;

	// 1. Collect vocabulary schemas
	const vocabularies = collectVocabularies(schema);

	// 2. Merge vocabulary properties into root
	mergeVocabularyProperties(schema, vocabularies);

	// 3. Build unified $defs
	const unifiedDefs = buildUnifiedDefs(schema, vocabularies);

	// 4. Remove top-level allOf (flatten composition)
	delete schema.allOf;

	// 5. Remove vocabulary objects from $defs
	if (schema.$defs) {
		for (const k of Object.keys(schema.$defs)) {
			if (schema.$defs[k] && schema.$defs[k].$id && schema.$defs[k].$dynamicAnchor === anchorName) {
				delete schema.$defs[k];
			}
		}
	}

	// 6. Assign unified defs
	schema.$defs = unifiedDefs;

	// 7. Convert dynamic recursion markers
	replaceDynamicRefs(schema, anchorName);
	replaceRecursiveRefs(schema, anchorName);
	stripDynamicAnchors(schema);

	// 8. Add static anchor at root
	delete schema.$dynamicAnchor;

	// 9. Update title to signal flattening
	if (schema.title) {
		schema.title = '(Flattened static) ' + schema.title;
	} else {
		schema.title = 'Flattened Draft 2020-12 meta-schema';
	}

	return schema;
}
