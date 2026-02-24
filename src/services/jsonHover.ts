/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Parser from '../parser/jsonParser';
import * as SchemaService from './jsonSchemaService';
import { JSONWorkerContribution } from '../jsonContributions';
import { TextDocument, PromiseConstructor, Position, Range, Hover, MarkedString } from '../jsonLanguageTypes';

export class JSONHover {

	private schemaService: SchemaService.IJSONSchemaService;
	private contributions: JSONWorkerContribution[];
	private promise: PromiseConstructor;

	constructor(schemaService: SchemaService.IJSONSchemaService, contributions: JSONWorkerContribution[] = [], promiseConstructor: PromiseConstructor) {
		this.schemaService = schemaService;
		this.contributions = contributions;
		this.promise = promiseConstructor || Promise;
	}

	public doHover(document: TextDocument, position: Position, doc: Parser.JSONDocument): PromiseLike<Hover | null> {

		const offset = document.offsetAt(position);
		let node = doc.getNodeFromOffset(offset);
		if (!node || (node.type === 'object' || node.type === 'array') && offset > node.offset + 1 && offset < node.offset + node.length - 1) {
			return this.promise.resolve(null);
		}
		const hoverRangeNode = node;

		// use the property description when hovering over an object key
		if (node.type === 'string') {
			const parent = node.parent;
			if (parent && parent.type === 'property' && parent.keyNode === node) {
				node = parent.valueNode;
				if (!node) {
					return this.promise.resolve(null);
				}
			}
		}

		const hoverRange = Range.create(document.positionAt(hoverRangeNode.offset), document.positionAt(hoverRangeNode.offset + hoverRangeNode.length));

		const createHover = (contents: MarkedString[]) => {
			const result: Hover = {
				contents: contents,
				range: hoverRange
			};
			return result;
		};

		const location = Parser.getNodePath(node);
		for (let i = this.contributions.length - 1; i >= 0; i--) {
			const contribution = this.contributions[i];
			const promise = contribution.getInfoContribution(document.uri, location);
			if (promise) {
				return promise.then(htmlContent => createHover(htmlContent));
			}
		}

		return this.schemaService.getSchemaForResource(document.uri, doc).then((schema) => {
			if (!schema) {
				return null
			}

			let title: string | undefined = undefined;
			let markdownDescription: string | undefined = undefined;
			let markdownEnumValueDescription: string | undefined = undefined, enumValue: string | undefined = undefined;

			const matchingSchemas = doc.getMatchingSchemas(schema.schema, node.offset).filter((s) => s.node === node && !s.inverted).map((s) => s.schema);
			for (const schema of matchingSchemas) {
				title = title || schema.title;
				markdownDescription = markdownDescription || schema.markdownDescription || toMarkdown(schema.description);
				if (schema.enum) {
					const idx = schema.enum.indexOf(Parser.getNodeValue(node));
					if (schema.markdownEnumDescriptions) {
						markdownEnumValueDescription = schema.markdownEnumDescriptions[idx];
					} else if (schema.enumDescriptions) {
						markdownEnumValueDescription = toMarkdown(schema.enumDescriptions[idx]);
					}
					if (markdownEnumValueDescription) {
						enumValue = schema.enum[idx];
						if (typeof enumValue !== 'string') {
							enumValue = JSON.stringify(enumValue);
						}
					}
				}
			}

			let result = '';
			if (title) {
				result = "**" + toMarkdown(title) + "**";
			}
			if (markdownDescription) {
				if (result.length > 0) {
					result += "\n\n";
				}
				result += markdownDescription;
			}
			if (markdownEnumValueDescription) {
				if (result.length > 0) {
					result += "\n\n";
				}
				result += `\`${toMarkdownCodeBlock(enumValue!)}\`: ${markdownEnumValueDescription}`;
			}
			return createHover([result]);
		});
	}
}

function toMarkdown(plain: string): string;
function toMarkdown(plain: string | undefined): string | undefined;
function toMarkdown(plain: string | undefined): string | undefined {
	if (plain) {
		return plain
			.trim()
			.replace(/[\\`*_{}[\]()<>#+\-.!]/g, '\\$&') // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
			.replace(/(^ +)/mg, (_match, g1) => '&nbsp;'.repeat(g1.length)) // escape leading spaces on each line
			.replace(/( {2,})/g, (_match, g1) => ' ' + '&nbsp;'.repeat(g1.length - 1)) // escape consecutive spaces
			.replace(/(\t+)/g, (_match, g1) => '&nbsp;'.repeat(g1.length * 4)) // escape tabs
			.replace(/\n/g, '\\\n'); // escape new lines
	}
	return undefined;
}

function toMarkdownCodeBlock(content: string) {
	// see https://daringfireball.net/projects/markdown/syntax#precode
	if (content.indexOf('`') !== -1) {
		return '`` ' + content + ' ``';
	}
	return content;
}
