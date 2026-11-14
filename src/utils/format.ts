import { format as formatJSON, Range as JSONCRange, EditResult, Edit, parseTree, createScanner, SyntaxKind, Node as JSONCNode } from 'jsonc-parser';
import { TextDocument, Range, TextEdit, FormattingOptions } from '../jsonLanguageTypes.js';

export function format(documentToFormat: TextDocument, formattingOptions?: FormattingOptions, formattingRange?: Range | undefined): TextEdit[] {
	let range: JSONCRange | undefined = undefined;
	if (formattingRange) {
		const offset = documentToFormat.offsetAt(formattingRange.start);
		const length = documentToFormat.offsetAt(formattingRange.end) - offset;
		range = { offset, length };
	}
	const options = {
		tabSize: formattingOptions ? formattingOptions.tabSize : 4,
		insertSpaces: formattingOptions?.insertSpaces === true,
		insertFinalNewline: formattingOptions?.insertFinalNewline === true,
		eol: '\n',
		keepLines: formattingOptions?.keepLines === true
	};
	const text = documentToFormat.getText();
	let edits = formatJSON(text, range, options);
	if (formattingOptions?.compact === true && !options.keepLines) {
		edits = compactEdits(text, edits, range, options.tabSize, formattingOptions.maxLineLength);
	}
	return edits.map(edit => {
		return TextEdit.replace(Range.create(documentToFormat.positionAt(edit.offset), documentToFormat.positionAt(edit.offset + edit.length)), edit.content);
	});
}

/**
 * Applies the formatter edits, collapses the containers that can be kept on a single line, and
 * returns the edits that turn the original text into the compacted text.
 */
function compactEdits(text: string, edits: EditResult, range: JSONCRange | undefined, tabSize: number, maxLineLength: number | undefined): EditResult {
	const formatted = applySortedEdits(text, edits);
	let start = 0;
	let end = formatted.length;
	if (range) {
		start = mapOffset(range.offset, edits);
		end = mapOffset(range.offset + range.length, edits);
	}
	const compacted = compactText(formatted, start, end, tabSize, maxLineLength);
	if (compacted === formatted) {
		return edits;
	}
	return computeWhitespaceEdits(text, compacted) ?? [computeReplaceEdit(text, compacted)];
}

/**
 * Applies sorted, non-overlapping edits in linear time.
 */
function applySortedEdits(text: string, edits: EditResult): string {
	const parts: string[] = [];
	let pos = 0;
	for (const edit of edits) {
		parts.push(text.substring(pos, edit.offset), edit.content);
		pos = edit.offset + edit.length;
	}
	parts.push(text.substring(pos));
	return parts.join('');
}

/**
 * Maps an offset in the original text to the corresponding offset in the text after applying the given (sorted, non-overlapping) edits.
 */
function mapOffset(offset: number, edits: EditResult): number {
	let delta = 0;
	for (const edit of edits) {
		if (edit.offset + edit.length <= offset) {
			delta += edit.content.length - edit.length;
		} else if (edit.offset < offset) {
			// offset is inside the edit: map to the end of the replacement
			return edit.offset + delta + edit.content.length;
		} else {
			break;
		}
	}
	return offset + delta;
}

function compactText(formatted: string, start: number, end: number, tabSize: number, maxLineLength: number | undefined): string {
	const root = parseTree(formatted, [], { allowTrailingComma: true, disallowComments: false });
	if (!root) {
		return formatted;
	}
	const parts: string[] = [];
	let lastLine = ''; // the content of the result after the last line break, to compute the column
	let pos = 0;

	const append = (str: string) => {
		parts.push(str);
		const lineBreak = Math.max(str.lastIndexOf('\n'), str.lastIndexOf('\r'));
		lastLine = lineBreak === -1 ? lastLine + str : str.substring(lineBreak + 1);
	};

	const visit = (node: JSONCNode) => {
		const nodeEnd = node.offset + node.length;
		if ((node.type === 'object' || node.type === 'array') && node.offset >= start && nodeEnd <= end) {
			const inline = renderInline(node, formatted);
			if (inline !== undefined) {
				const original = formatted.substring(node.offset, nodeEnd);
				if (inline !== original && isSameContent(original, inline)) {
					append(formatted.substring(pos, node.offset));
					pos = node.offset;
					const lineLength = getWidth(lastLine, tabSize) + inline.length + getLineSuffix(formatted, nodeEnd).length;
					if (maxLineLength === undefined || lineLength <= maxLineLength) {
						append(inline);
						pos = nodeEnd;
						return;
					}
				}
			}
		}
		if (node.children) {
			for (const child of node.children) {
				visit(child);
			}
		}
	};
	visit(root);
	parts.push(formatted.substring(pos));
	return parts.join('');
}

/**
 * Returns the single-line representation of the given object or array, or `undefined` if one of the containers
 * (the node itself or a nested one) has more than one entry.
 */
function renderInline(node: JSONCNode, text: string): string | undefined {
	const children = node.children ?? [];
	if (children.length > 1) {
		return undefined;
	}
	if (node.type === 'object') {
		if (children.length === 0) {
			return '{}';
		}
		const [key, value] = children[0].children ?? [];
		if (!key || !value) {
			return undefined;
		}
		const valueText = renderValue(value, text);
		return valueText === undefined ? undefined : `{ ${getText(key, text)}: ${valueText} }`;
	}
	if (children.length === 0) {
		return '[]';
	}
	const valueText = renderValue(children[0], text);
	return valueText === undefined ? undefined : `[ ${valueText} ]`;
}

function renderValue(node: JSONCNode, text: string): string | undefined {
	if (node.type === 'object' || node.type === 'array') {
		return renderInline(node, text);
	}
	return getText(node, text);
}

function getText(node: JSONCNode, text: string): string {
	return text.substring(node.offset, node.offset + node.length);
}

/**
 * Guards against dropping content: comments, trailing commas or content the parser skipped because of errors are not part of the rendering.
 */
function isSameContent(original: string, inline: string): boolean {
	return original.replace(/\s+/g, '') === inline.replace(/\s+/g, '');
}

function getWidth(line: string, tabSize: number): number {
	let width = 0;
	for (let i = 0; i < line.length; i++) {
		width += line.charCodeAt(i) === 9 /* tab */ ? tabSize : 1;
	}
	return width;
}

/**
 * Returns the content that follows the given offset on the same line (e.g. a trailing comma)
 */
function getLineSuffix(text: string, offset: number): string {
	let lineEnd = offset;
	while (lineEnd < text.length && text.charAt(lineEnd) !== '\n' && text.charAt(lineEnd) !== '\r') {
		lineEnd++;
	}
	return text.substring(offset, lineEnd).trimEnd();
}

/**
 * Computes minimal edits between two texts that only differ in the whitespace between tokens.
 * Returns `undefined` if the texts have different tokens.
 */
function computeWhitespaceEdits(original: string, modified: string): EditResult | undefined {
	const originalScanner = createScanner(original, false);
	const modifiedScanner = createScanner(modified, false);
	const edits: Edit[] = [];
	let originalPos = 0;
	let modifiedPos = 0;
	while (true) {
		const originalToken = scanNonWhitespace(originalScanner);
		const modifiedToken = scanNonWhitespace(modifiedScanner);
		if (originalToken !== modifiedToken) {
			return undefined;
		}
		const originalOffset = originalScanner.getTokenOffset();
		const modifiedOffset = modifiedScanner.getTokenOffset();
		const originalEnd = originalOffset + originalScanner.getTokenLength();
		const modifiedEnd = modifiedOffset + modifiedScanner.getTokenLength();
		if (original.substring(originalOffset, originalEnd) !== modified.substring(modifiedOffset, modifiedEnd)) {
			return undefined;
		}
		const modifiedWhitespace = modified.substring(modifiedPos, modifiedOffset);
		if (original.substring(originalPos, originalOffset) !== modifiedWhitespace) {
			edits.push({ offset: originalPos, length: originalOffset - originalPos, content: modifiedWhitespace });
		}
		if (originalToken === SyntaxKind.EOF) {
			return edits;
		}
		originalPos = originalEnd;
		modifiedPos = modifiedEnd;
	}
}

function scanNonWhitespace(scanner: ReturnType<typeof createScanner>): SyntaxKind {
	let token = scanner.scan();
	while (token === SyntaxKind.Trivia || token === SyntaxKind.LineBreakTrivia) {
		token = scanner.scan();
	}
	return token;
}

function computeReplaceEdit(original: string, modified: string): Edit {
	let prefix = 0;
	const minLength = Math.min(original.length, modified.length);
	while (prefix < minLength && original.charCodeAt(prefix) === modified.charCodeAt(prefix)) {
		prefix++;
	}
	let suffix = 0;
	while (suffix < minLength - prefix && original.charCodeAt(original.length - 1 - suffix) === modified.charCodeAt(modified.length - 1 - suffix)) {
		suffix++;
	}
	return { offset: prefix, length: original.length - prefix - suffix, content: modified.substring(prefix, modified.length - suffix) };
}
