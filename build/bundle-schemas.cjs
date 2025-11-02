/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs').promises;
const Bundler = require("@hyperjump/json-schema-bundle");

(async function () {
    bundle(`https://json-schema.org/draft/2019-09/schema`, 'draft09');
    bundle(`https://json-schema.org/draft/2020-12/schema`, 'draft12');
}());

async function bundle(uri, filename) {
    const metaSchema = await Bundler.get(uri);
    const bundle = await Bundler.bundle(metaSchema);
    const jsonified = JSON.stringify(bundle, null, 2).replace(/"undefined": ""/g, '"$dynamicAnchor": "meta"');
    const jsified = 'export default ' + printObject(JSON.parse(jsonified));
    fs.writeFile(`./${filename}.json`, jsonified, 'utf8');
    fs.writeFile(`./${filename}.js`, jsified, 'utf8');
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
