import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
	findNodeAtLocation,
	findNodeAtOffset,
	parse,
	parseTree,
	printParseErrorCode,
	type Node as JsonNode,
	type ParseError
} from 'jsonc-parser';
import {
	Diagnostic,
	DiagnosticSeverity,
	Location,
	Position,
	Range,
	type DocumentLink
} from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';

const require = createRequire(import.meta.url);
const jsonpointer: typeof import('jsonpointer') = require('jsonpointer');

export interface ResolvedJrefTarget {
	readonly targetUri: string;
	readonly targetRange: Range;
	readonly targetSelectionRange: Range;
}

export interface DocumentProvider {
	get(uri: string): Promise<TextDocument | undefined>;
}

export function createSyntaxDiagnostics(document: TextDocument): Diagnostic[] {
	const errors: ParseError[] = [];
	parseTree(document.getText(), errors, {
		allowTrailingComma: false,
		disallowComments: true
	});

	return errors.map((error) => ({
		message: `Syntax error: ${printParseErrorCode(error.error)}`,
		range: Range.create(
			Position.create(error.startLine, error.startCharacter),
			Position.create(error.startLine, error.startCharacter + Math.max(error.length, 1))
		),
		severity: DiagnosticSeverity.Error,
		source: 'jref'
	}));
}

export async function findDefinitionTarget(
	document: TextDocument,
	position: Position,
	provider: DocumentProvider
): Promise<ResolvedJrefTarget | null> {
	const root = parseTree(document.getText(), [], {
		allowTrailingComma: false,
		disallowComments: true
	});

	if (!root) {
		return null;
	}

	const node = findNodeAtOffset(root, document.offsetAt(position), true);
	const refNode = getRefValueNode(node);
	if (!refNode || typeof refNode.value !== 'string') {
		return null;
	}

	return resolveReferenceTarget(document.uri, refNode.value, provider);
}

export async function findDocumentLinks(
	document: TextDocument,
	provider: DocumentProvider
): Promise<DocumentLink[]> {
	const root = parseTree(document.getText(), [], {
		allowTrailingComma: false,
		disallowComments: true
	});

	if (!root) {
		return [];
	}

	const links: DocumentLink[] = [];
	for (const refNode of collectRefValueNodes(root)) {
		if (typeof refNode.value !== 'string') {
			continue;
		}

		const target = await resolveReferenceTarget(document.uri, refNode.value, provider);
		if (!target) {
			continue;
		}

		links.push({
			range: createInnerStringRange(document, refNode),
			target: target.targetUri
		});
	}

	return links;
}

export class WorkspaceDocumentProvider implements DocumentProvider {
	public constructor(
		private readonly openDocuments: Map<string, TextDocument>
	) {}

	public async get(uri: string): Promise<TextDocument | undefined> {
		const openDocument = this.openDocuments.get(uri);
		if (openDocument) {
			return openDocument;
		}

		const parsed = URI.parse(uri);
		if (parsed.scheme !== 'file') {
			return undefined;
		}

		try {
			const contents = await readFile(parsed.fsPath, 'utf8');
			return TextDocument.create(uri, 'jref', 0, contents);
		} catch {
			return undefined;
		}
	}
}

function createInnerStringRange(document: TextDocument, node: JsonNode): Range {
	return Range.create(
		document.positionAt(node.offset + 1),
		document.positionAt(node.offset + Math.max(node.length - 1, 1))
	);
}

function collectRefValueNodes(root: JsonNode): JsonNode[] {
	const nodes: JsonNode[] = [];

	const visit = (node: JsonNode): void => {
		const refNode = getRefValueNode(node);
		if (refNode === node) {
			nodes.push(node);
		}

		for (const child of node.children ?? []) {
			visit(child);
		}
	};

	visit(root);
	return nodes;
}

function getRefValueNode(node: JsonNode | undefined): JsonNode | null {
	if (!node || node.type !== 'string' || node.parent?.type !== 'property') {
		return null;
	}

	const [keyNode, valueNode] = node.parent.children ?? [];
	if (keyNode?.type !== 'string' || keyNode.value !== '$ref' || valueNode !== node) {
		return null;
	}

	return node;
}

async function resolveReferenceTarget(
	baseUri: string,
	reference: string,
	provider: DocumentProvider
): Promise<ResolvedJrefTarget | null> {
	let targetUrl: URL;
	try {
		targetUrl = new URL(reference, baseUri);
	} catch {
		return null;
	}

	const targetUri = targetUrl.toString();
	const targetDocument = await provider.get(targetUriWithoutFragment(targetUri));
	if (!targetDocument) {
		return null;
	}

	const fragment = decodeURIComponent(targetUrl.hash.slice(1));
	const targetRange = findTargetRange(targetDocument, fragment);
	if (!targetRange) {
		return null;
	}

	return {
		targetUri,
		targetRange,
		targetSelectionRange: targetRange
	};
}

function targetUriWithoutFragment(uri: string): string {
	const parsed = URI.parse(uri);
	return parsed.with({ fragment: '' }).toString();
}

function findTargetRange(document: TextDocument, fragment: string): Range | null {
	if (!fragment || fragment === '#') {
		return Range.create(Position.create(0, 0), Position.create(0, 0));
	}

	const root = parseTree(document.getText(), [], {
		allowTrailingComma: false,
		disallowComments: true
	});
	if (!root) {
		return null;
	}

	const targetValue = safelyResolvePointer(document.getText(), fragment);
	if (targetValue.missing) {
		return null;
	}

	const path = pointerToPath(fragment);
	const targetNode = findNodeAtLocation(root, path);
	if (!targetNode) {
		return null;
	}

	const position = document.positionAt(targetNode.offset);
	return Range.create(position, position);
}

function safelyResolvePointer(text: string, fragment: string): { missing: boolean } {
	try {
		const value = parse(text, [], {
			allowTrailingComma: false,
			disallowComments: true
		});
		if (fragment === '') {
			return { missing: false };
		}

		const resolved = jsonpointer.get(value, fragment);
		return { missing: resolved === undefined };
	} catch {
		return { missing: true };
	}
}

function pointerToPath(fragment: string): (string | number)[] {
	if (!fragment) {
		return [];
	}

	return fragment
		.split('/')
		.slice(1)
		.map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
		.map((segment) => (/^(0|[1-9][0-9]*)$/.test(segment) ? Number(segment) : segment));
}

export function toLocation(target: ResolvedJrefTarget): Location {
	return Location.create(target.targetUri, target.targetRange);
}
