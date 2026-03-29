import {
	createConnection,
	DiagnosticSeverity,
	ProposedFeatures,
	TextDocumentSyncKind,
	type DefinitionParams,
	type DocumentLinkParams,
	type InitializeParams,
	type InitializeResult
} from 'vscode-languageserver/node.js';
import { TextDocuments } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
	WorkspaceDocumentProvider,
	createSyntaxDiagnostics,
	findDefinitionTarget,
	findDocumentLinks,
	toLocation
} from './jrefSupport.js';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const openDocuments = new Map<string, TextDocument>();
const provider = new WorkspaceDocumentProvider(openDocuments);

connection.onInitialize((_params: InitializeParams): InitializeResult => ({
	capabilities: {
		textDocumentSync: TextDocumentSyncKind.Incremental,
		definitionProvider: true,
		documentLinkProvider: {
			resolveProvider: false
		}
	}
}));

documents.onDidOpen((event) => {
	openDocuments.set(event.document.uri, event.document);
	validateDocument(event.document);
});

documents.onDidChangeContent((event) => {
	openDocuments.set(event.document.uri, event.document);
	validateDocument(event.document);
});

documents.onDidClose((event) => {
	openDocuments.delete(event.document.uri);
	connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onDefinition(async (params: DefinitionParams) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return null;
	}

	const target = await findDefinitionTarget(document, params.position, provider);
	return target ? toLocation(target) : null;
});

connection.onDocumentLinks(async (params: DocumentLinkParams) => {
	const document = documents.get(params.textDocument.uri);
	if (!document) {
		return [];
	}

	return findDocumentLinks(document, provider);
});

documents.listen(connection);
connection.listen();

function validateDocument(document: TextDocument): void {
	const diagnostics = createSyntaxDiagnostics(document).map((diagnostic) => ({
		...diagnostic,
		severity: diagnostic.severity ?? DiagnosticSeverity.Error
	}));

	connection.sendDiagnostics({
		uri: document.uri,
		diagnostics
	});
}
