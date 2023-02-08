import { format as formatJSON, Range as JSONCRange } from 'jsonc-parser'; 
import { TextDocument, Range, TextEdit, FormattingOptions } from '../jsonLanguageTypes';

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
		keepLines : formattingOptions?.keepLines === true 
	};
	return formatJSON(documentToFormat.getText(), range, options).map(edit => {
		return TextEdit.replace(Range.create(documentToFormat.positionAt(edit.offset), documentToFormat.positionAt(edit.offset + edit.length)), edit.content);
	});
}