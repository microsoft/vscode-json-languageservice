import * as assert from 'assert';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { suite, test } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import {
	WorkspaceDocumentProvider,
	createSyntaxDiagnostics,
	findDefinitionTarget,
	findDocumentLinks
} from '../jrefSupport.js';

suite('JRef Language Server', () => {
	test('reports syntax diagnostics for invalid JSON', () => {
		const document = TextDocument.create('file:///person.jref', 'jref', 0, '{"name": }');
		const diagnostics = createSyntaxDiagnostics(document);

		assert.equal(diagnostics.length, 1);
		assert.match(diagnostics[0].message, /Syntax error:/);
	});

	test('resolves cross-file references as definitions and document links', async () => {
		const tempDirectory = await mkdtemp(join(tmpdir(), 'jref-lsp-'));

		try {
			const personPath = join(tempDirectory, 'person.jref');
			const addressPath = join(tempDirectory, 'address.jref');

			await writeFile(personPath, '{\n  "name": "Jason",\n  "address": { "$ref": "address.jref#/city" }\n}\n', 'utf8');
			await writeFile(addressPath, '{\n  "address": "123 Fake St",\n  "city": "Nowheresville"\n}\n', 'utf8');

			const personUri = URI.file(personPath).toString();
			const addressUri = URI.file(addressPath).toString();
			const personDocument = TextDocument.create(
				personUri,
				'jref',
				0,
				await readFile(personPath, 'utf8')
			);

			const provider = new WorkspaceDocumentProvider(new Map([[personUri, personDocument]]));
			const referenceOffset = personDocument.getText().indexOf('address.jref#/city') + 2;
			const target = await findDefinitionTarget(
				personDocument,
				personDocument.positionAt(referenceOffset),
				provider
			);
			const links = await findDocumentLinks(personDocument, provider);

			assert.ok(target);
			assert.equal(target?.targetUri, `${addressUri}#/city`);
			assert.deepEqual(target?.targetRange.start, { line: 2, character: 10 });
			assert.equal(links.length, 1);
			assert.equal(links[0].target, `${addressUri}#/city`);
		} finally {
			await rm(tempDirectory, { recursive: true, force: true });
		}
	});

	test('ignores unresolved JSON Pointer fragments', async () => {
		const tempDirectory = await mkdtemp(join(tmpdir(), 'jref-lsp-'));

		try {
			const personPath = join(tempDirectory, 'person.jref');
			const addressPath = join(tempDirectory, 'address.jref');

			await writeFile(personPath, '{ "address": { "$ref": "address.jref#/missing" } }', 'utf8');
			await writeFile(addressPath, '{ "city": "Nowheresville" }', 'utf8');

			const personUri = URI.file(personPath).toString();
			const personDocument = TextDocument.create(
				personUri,
				'jref',
				0,
				await readFile(personPath, 'utf8')
			);

			const provider = new WorkspaceDocumentProvider(new Map([[personUri, personDocument]]));
			const referenceOffset = personDocument.getText().indexOf('address.jref#/missing') + 2;
			const target = await findDefinitionTarget(
				personDocument,
				personDocument.positionAt(referenceOffset),
				provider
			);
			const links = await findDocumentLinks(personDocument, provider);

			assert.equal(target, null);
			assert.deepEqual(links, []);
		} finally {
			await rm(tempDirectory, { recursive: true, force: true });
		}
	});
});
