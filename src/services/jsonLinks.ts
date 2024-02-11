/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentLink } from 'vscode-languageserver-types';
import { TextDocument, ASTNode, PropertyASTNode, Range, Thenable, FileSystemProvider, FileType, FileStat } from '../jsonLanguageTypes';
import { JSONDocument } from '../parser/jsonParser';
import { IJSONSchemaService } from './jsonSchemaService';
import { URI, Utils } from 'vscode-uri';

export class JSONLinks {
	private schemaService: IJSONSchemaService;
	private fileSystemProvider: FileSystemProvider | undefined;

	constructor(schemaService: IJSONSchemaService, fileSystemProvider?: FileSystemProvider) {
		this.schemaService = schemaService;
		this.fileSystemProvider = fileSystemProvider;
	}

	public findLinks(document: TextDocument, doc: JSONDocument): Thenable<DocumentLink[]> {
		return findLinks(document, doc, this.schemaService, this.fileSystemProvider);
	}
}

export function findLinks(document: TextDocument, doc: JSONDocument, schemaService?: IJSONSchemaService, fileSystemProvider?: FileSystemProvider): Thenable<DocumentLink[]> {
	const promises: Thenable<DocumentLink[]>[] = [];

	const refLinks: DocumentLink[] = [];
	doc.visit(node => {
		if (node.type === "property" && node.valueNode?.type === 'string' && node.keyNode.value === "$ref") {
			const path = node.valueNode.value;
			const targetNode = findTargetNode(doc, path);
			if (targetNode) {
				const targetPos = document.positionAt(targetNode.offset);
				refLinks.push({
					target: `${document.uri}#${targetPos.line + 1},${targetPos.character + 1}`,
					range: createRange(document, node.valueNode)
				});
			}
		}
		if (node.type === "property" && node.valueNode?.type === 'string' && schemaService && fileSystemProvider) {
			const pathNode = node.valueNode;
			const promise = schemaService.getSchemaForResource(document.uri, doc).then((schema) => {
				const pathLinks: DocumentLink[] = [];
				if (!schema) {
					return pathLinks;
				}

				const matchingSchemas = doc.getMatchingSchemas(schema.schema, pathNode.offset);

				let resolvedRef = '';
				for (const s of matchingSchemas) {
					if (s.node !== pathNode || s.inverted || !s.schema) {
						continue; // Not an _exact_ schema match.
					}
					if (s.schema.format !== 'uri-reference') {
						continue; // Not a uri-ref.
					}
					const pathURI = resolveURIRef(pathNode.value, document);
					if (pathURI.scheme === 'file') {
						resolvedRef = pathURI.toString();
					}
				}

				if (resolvedRef) {
					return fileSystemProvider.stat(resolvedRef).then((fs) => {
						if (fileExists(fs)) {
							pathLinks.push({
								target: resolvedRef,
								range: createRange(document, pathNode)
							});
						}
						return pathLinks;
					});
				} else {
					return pathLinks;
				}
			});
			promises.push(promise);
		}
		return true;
	});

	promises.push(Promise.resolve(refLinks));
	return Promise.all(promises).then(values => {
		return values.flat();
	});
}

function fileExists(stat: FileStat): boolean {
	if (stat.type === FileType.Unknown && stat.size === -1) {
		return false;
	}
	return true;
}

function createRange(document: TextDocument, node: ASTNode): Range {
	return Range.create(document.positionAt(node.offset + 1), document.positionAt(node.offset + node.length - 1));
}

function findTargetNode(doc: JSONDocument, path: string): ASTNode | null {
	const tokens = parseJSONPointer(path);
	if (!tokens) {
		return null;
	}
	return findNode(tokens, doc.root);
}

function findNode(pointer: string[], node: ASTNode | null | undefined): ASTNode | null {
	if (!node) {
		return null;
	}
	if (pointer.length === 0) {
		return node;
	}

	const token: string = pointer.shift() as string;
	if (node && node.type === 'object') {
		const propertyNode: PropertyASTNode | undefined = node.properties.find((propertyNode) => propertyNode.keyNode.value === token);
		if (!propertyNode) {
			return null;
		}
		return findNode(pointer, propertyNode.valueNode);
	} else if (node && node.type === 'array') {
		if (token.match(/^(0|[1-9][0-9]*)$/)) {
			const index = Number.parseInt(token);
			const arrayItem = node.items[index];
			if (!arrayItem) {
				return null;
			}
			return findNode(pointer, arrayItem);
		}
	}
	return null;
}

function parseJSONPointer(path: string): string[] | null {
	if (path === "#") {
		return [];
	}

	if (path[0] !== '#' || path[1] !== '/') {
		return null;
	}

	return path.substring(2).split(/\//).map(unescape);
}

function unescape(str: string): string {
	return str.replace(/~1/g, '/').replace(/~0/g, '~');
}

function resolveURIRef(ref: string, document: TextDocument): URI {
	if (ref.indexOf('://') > 0) {
		// Already a fully qualified URI.
		return URI.parse(ref);
	}

	if (ref.startsWith('/')) {
		// Already an absolute path, no need to resolve.
		return URI.file(ref);
	}

	// Resolve ref relative to the document.
	const docURI = URI.parse(document.uri);
	return Utils.joinPath(Utils.dirname(docURI), ref);
}
