/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Parser from '../parser/jsonParser';
import * as SchemaService from './jsonSchemaService';
import { JSONWorkerContribution } from '../jsonContributions';
import { TextDocument, PromiseConstructor, Thenable, Position, Range, Hover, MarkupContent, MarkupKind } from '../jsonLanguageTypes';

export class JSONHover {

	private schemaService: SchemaService.IJSONSchemaService;
	private contributions: JSONWorkerContribution[];
	private promise: PromiseConstructor;

	constructor(schemaService: SchemaService.IJSONSchemaService, contributions: JSONWorkerContribution[] = [], promiseConstructor: PromiseConstructor) {
		this.schemaService = schemaService;
		this.contributions = contributions;
		this.promise = promiseConstructor || Promise;
	}

	public doHover(document: TextDocument, position: Position, doc: Parser.JSONDocument): Thenable<Hover | null> {

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

		var createHover = (contents: Hover["contents"]) => {
			const result: Hover = {
				contents,
				range: hoverRange
			};
			return result;
		};

		const location = Parser.getNodePath(node);
		for (let i = this.contributions.length - 1; i >= 0; i--) {
			const contribution = this.contributions[i];
			const promise = contribution.getInfoContribution(document.uri, location);
			return promise?.then(htmlContent => createHover(htmlContent));
		}

		return this.schemaService.getSchemaForResource(document.uri, doc).then((schema) => {
			if (schema && node) {
				const matchingSchemas = doc.getMatchingSchemas(schema.schema, node.offset);

				let markdownFormat: boolean = false;
				let title: string | undefined = undefined;
				let description: string | undefined = undefined;
				let enumValueDescription: string | undefined = undefined, enumValue: string | undefined = undefined;
				matchingSchemas.every((s) => {
					if (s.node === node && !s.inverted && s.schema) {
						title = title || s.schema.title;
						if (!description) {
							if (s.schema.markdownDescription) {
								markdownFormat = true;
								description = s.schema.markdownDescription;
							} else {
								description = s.schema.description;
							}
						}
						if (s.schema.enum) {
							const idx = s.schema.enum.indexOf(Parser.getNodeValue(node));
							if (s.schema.markdownEnumDescriptions) {
								enumValueDescription = s.schema.markdownEnumDescriptions[idx];
							} else if (s.schema.enumDescriptions) {
								enumValueDescription = s.schema.enumDescriptions[idx];
							}
							if (enumValueDescription) {
								// enums values are always wrapped as code blocks, so they'll always be presented as markdown
								markdownFormat = true;
								enumValue = s.schema.enum[idx];
								if (typeof enumValue !== 'string') {
									enumValue = JSON.stringify(enumValue);
								}
							}
						}
					}
					return true;
				});
				const result: MarkupContent = {
					kind: markdownFormat ? MarkupKind.Markdown : MarkupKind.PlainText,
					value: '',
				};
				if (title) {
					result.value += markdownFormat ? toMarkdown(title) : title;
				}
				if (description) {
					if (result.value.length > 0) {
						result.value += "\n\n";
					}
					result.value += description;
				}
				if (enumValueDescription) {
					if (result.value.length > 0) {
						result.value += "\n\n";
					}
					result.value += `\`${toMarkdownCodeBlock(enumValue!)}\`: ${enumValueDescription}`;
				}
				return createHover(result);
			}
			return null;
		});
	}
}
function toMarkdown(plain: string): string;
function toMarkdown(plain: string | undefined): string | undefined;
function toMarkdown(plain: string | undefined): string | undefined {
	if (plain) {
		const res = plain.replace(/([^\n\r])(\r?\n)([^\n\r])/gm, '$1\n\n$3'); // single new lines to \n\n (Markdown paragraph)
		return res.replace(/[\\`*_{}[\]()#+\-.!]/g, "\\$&"); // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
	}
	return undefined;
}

function toMarkdownCodeBlock(content: string) {
	// see https://daringfireball.net/projects/markdown/syntax#precode
	if (content.includes('`')) {
		return '`` ' + content + ' ``';
	}
	return content;
}
