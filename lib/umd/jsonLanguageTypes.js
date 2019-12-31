(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "vscode-languageserver-types", "vscode-languageserver-textdocument"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var vscode_languageserver_types_1 = require("vscode-languageserver-types");
    exports.Range = vscode_languageserver_types_1.Range;
    exports.TextEdit = vscode_languageserver_types_1.TextEdit;
    exports.Color = vscode_languageserver_types_1.Color;
    exports.ColorInformation = vscode_languageserver_types_1.ColorInformation;
    exports.ColorPresentation = vscode_languageserver_types_1.ColorPresentation;
    exports.FoldingRange = vscode_languageserver_types_1.FoldingRange;
    exports.FoldingRangeKind = vscode_languageserver_types_1.FoldingRangeKind;
    exports.MarkupKind = vscode_languageserver_types_1.MarkupKind;
    exports.SelectionRange = vscode_languageserver_types_1.SelectionRange;
    exports.Diagnostic = vscode_languageserver_types_1.Diagnostic;
    exports.DiagnosticSeverity = vscode_languageserver_types_1.DiagnosticSeverity;
    exports.CompletionItem = vscode_languageserver_types_1.CompletionItem;
    exports.CompletionItemKind = vscode_languageserver_types_1.CompletionItemKind;
    exports.CompletionList = vscode_languageserver_types_1.CompletionList;
    exports.Position = vscode_languageserver_types_1.Position;
    exports.InsertTextFormat = vscode_languageserver_types_1.InsertTextFormat;
    exports.MarkupContent = vscode_languageserver_types_1.MarkupContent;
    exports.SymbolInformation = vscode_languageserver_types_1.SymbolInformation;
    exports.SymbolKind = vscode_languageserver_types_1.SymbolKind;
    exports.DocumentSymbol = vscode_languageserver_types_1.DocumentSymbol;
    exports.Location = vscode_languageserver_types_1.Location;
    exports.Hover = vscode_languageserver_types_1.Hover;
    exports.MarkedString = vscode_languageserver_types_1.MarkedString;
    exports.FormattingOptions = vscode_languageserver_types_1.FormattingOptions;
    var vscode_languageserver_textdocument_1 = require("vscode-languageserver-textdocument");
    exports.TextDocument = vscode_languageserver_textdocument_1.TextDocument;
    /**
     * Error codes used by diagnostics
     */
    var ErrorCode;
    (function (ErrorCode) {
        ErrorCode[ErrorCode["Undefined"] = 0] = "Undefined";
        ErrorCode[ErrorCode["EnumValueMismatch"] = 1] = "EnumValueMismatch";
        ErrorCode[ErrorCode["UnexpectedEndOfComment"] = 257] = "UnexpectedEndOfComment";
        ErrorCode[ErrorCode["UnexpectedEndOfString"] = 258] = "UnexpectedEndOfString";
        ErrorCode[ErrorCode["UnexpectedEndOfNumber"] = 259] = "UnexpectedEndOfNumber";
        ErrorCode[ErrorCode["InvalidUnicode"] = 260] = "InvalidUnicode";
        ErrorCode[ErrorCode["InvalidEscapeCharacter"] = 261] = "InvalidEscapeCharacter";
        ErrorCode[ErrorCode["InvalidCharacter"] = 262] = "InvalidCharacter";
        ErrorCode[ErrorCode["PropertyExpected"] = 513] = "PropertyExpected";
        ErrorCode[ErrorCode["CommaExpected"] = 514] = "CommaExpected";
        ErrorCode[ErrorCode["ColonExpected"] = 515] = "ColonExpected";
        ErrorCode[ErrorCode["ValueExpected"] = 516] = "ValueExpected";
        ErrorCode[ErrorCode["CommaOrCloseBacketExpected"] = 517] = "CommaOrCloseBacketExpected";
        ErrorCode[ErrorCode["CommaOrCloseBraceExpected"] = 518] = "CommaOrCloseBraceExpected";
        ErrorCode[ErrorCode["TrailingComma"] = 519] = "TrailingComma";
        ErrorCode[ErrorCode["DuplicateKey"] = 520] = "DuplicateKey";
        ErrorCode[ErrorCode["CommentNotPermitted"] = 521] = "CommentNotPermitted";
        ErrorCode[ErrorCode["SchemaResolveError"] = 768] = "SchemaResolveError";
    })(ErrorCode = exports.ErrorCode || (exports.ErrorCode = {}));
    var ClientCapabilities;
    (function (ClientCapabilities) {
        ClientCapabilities.LATEST = {
            textDocument: {
                completion: {
                    completionItem: {
                        documentationFormat: [vscode_languageserver_types_1.MarkupKind.Markdown, vscode_languageserver_types_1.MarkupKind.PlainText],
                        commitCharactersSupport: true
                    }
                }
            }
        };
    })(ClientCapabilities = exports.ClientCapabilities || (exports.ClientCapabilities = {}));
});
//# sourceMappingURL=jsonLanguageTypes.js.map