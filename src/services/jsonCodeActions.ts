/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';

import {
	CodeAction, CodeActionContext, CodeActionKind, Diagnostic, ErrorCode, Position, Range,
	TextDocument, TextDocumentEdit, TextEdit, VersionedTextDocumentIdentifier, WorkspaceEdit
} from '../jsonLanguageTypes.js';

export class JSONCodeActions {

	public doCodeActions(document: TextDocument, range: Range, context: CodeActionContext): CodeAction[] {
		const result: CodeAction[] = [];
		for (const diagnostic of context.diagnostics) {
			if (diagnostic.code === ErrorCode.TrailingComma && intersects(diagnostic.range, range)) {
				this.appendRemoveTrailingCommaFix(document, diagnostic, result);
			}
		}
		return result;
	}

	private appendRemoveTrailingCommaFix(document: TextDocument, diagnostic: Diagnostic, result: CodeAction[]): void {
		if (document.getText(diagnostic.range) !== ',') {
			return;
		}

		const edit = TextEdit.del(diagnostic.range);
		const documentIdentifier = VersionedTextDocumentIdentifier.create(document.uri, document.version);
		const workspaceEdit: WorkspaceEdit = {
			documentChanges: [TextDocumentEdit.create(documentIdentifier, [edit])]
		};
		const action = CodeAction.create(l10n.t('Remove trailing comma'), workspaceEdit, CodeActionKind.QuickFix);
		action.diagnostics = [diagnostic];
		result.push(action);
	}
}

function intersects(left: Range, right: Range): boolean {
	return comparePositions(left.start, right.end) <= 0 && comparePositions(right.start, left.end) <= 0;
}

function comparePositions(left: Position, right: Position): number {
	return left.line - right.line || left.character - right.character;
}
