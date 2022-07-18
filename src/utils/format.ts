import { format as formatJSON, Range as JSONCRange } from 'jsonc-parser'; 
import { TextDocument, Range, TextEdit, FormattingOptions } from '../jsonLanguageTypes';

export function format(d: TextDocument, r: Range | undefined, o: FormattingOptions): TextEdit[] {
	let range: JSONCRange | undefined = undefined;
	if (r) {
		const offset = d.offsetAt(r.start);
		const length = d.offsetAt(r.end) - offset;
		range = { offset, length };
	}
	const options = { tabSize: o ? o.tabSize : 4, insertSpaces: o?.insertSpaces === true, insertFinalNewline: o?.insertFinalNewline === true, eol: '\n', keepLines: o?.keepLines === true };
	return formatJSON(d.getText(), range, options).map(e => {
		return TextEdit.replace(Range.create(d.positionAt(e.offset), d.positionAt(e.offset + e.length)), e.content);
	});
}