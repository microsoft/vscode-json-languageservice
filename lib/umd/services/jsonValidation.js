/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
(function (factory) {
    if (typeof module === "object" && typeof module.exports === "object") {
        var v = factory(require, exports);
        if (v !== undefined) module.exports = v;
    }
    else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "./jsonSchemaService", "../jsonLanguageTypes", "vscode-nls", "../utils/objects"], factory);
    }
})(function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var jsonSchemaService_1 = require("./jsonSchemaService");
    var jsonLanguageTypes_1 = require("../jsonLanguageTypes");
    var nls = require("vscode-nls");
    var objects_1 = require("../utils/objects");
    var localize = nls.loadMessageBundle();
    var JSONValidation = /** @class */ (function () {
        function JSONValidation(jsonSchemaService, promiseConstructor) {
            this.jsonSchemaService = jsonSchemaService;
            this.promise = promiseConstructor;
            this.validationEnabled = true;
        }
        JSONValidation.prototype.configure = function (raw) {
            if (raw) {
                this.validationEnabled = raw.validate;
                this.commentSeverity = raw.allowComments ? void 0 : jsonLanguageTypes_1.DiagnosticSeverity.Error;
            }
        };
        JSONValidation.prototype.doValidation = function (textDocument, jsonDocument, documentSettings, schema) {
            var _this = this;
            if (!this.validationEnabled) {
                return this.promise.resolve([]);
            }
            var diagnostics = [];
            var added = {};
            var addProblem = function (problem) {
                // remove duplicated messages
                var signature = problem.range.start.line + ' ' + problem.range.start.character + ' ' + problem.message;
                if (!added[signature]) {
                    added[signature] = true;
                    diagnostics.push(problem);
                }
            };
            var getDiagnostics = function (schema) {
                var trailingCommaSeverity = documentSettings ? toDiagnosticSeverity(documentSettings.trailingCommas) : jsonLanguageTypes_1.DiagnosticSeverity.Error;
                var commentSeverity = documentSettings ? toDiagnosticSeverity(documentSettings.comments) : _this.commentSeverity;
                if (schema) {
                    if (schema.errors.length && jsonDocument.root) {
                        var astRoot = jsonDocument.root;
                        var property = astRoot.type === 'object' ? astRoot.properties[0] : null;
                        if (property && property.keyNode.value === '$schema') {
                            var node = property.valueNode || property;
                            var range = jsonLanguageTypes_1.Range.create(textDocument.positionAt(node.offset), textDocument.positionAt(node.offset + node.length));
                            addProblem(jsonLanguageTypes_1.Diagnostic.create(range, schema.errors[0], jsonLanguageTypes_1.DiagnosticSeverity.Warning, jsonLanguageTypes_1.ErrorCode.SchemaResolveError));
                        }
                        else {
                            var range = jsonLanguageTypes_1.Range.create(textDocument.positionAt(astRoot.offset), textDocument.positionAt(astRoot.offset + 1));
                            addProblem(jsonLanguageTypes_1.Diagnostic.create(range, schema.errors[0], jsonLanguageTypes_1.DiagnosticSeverity.Warning, jsonLanguageTypes_1.ErrorCode.SchemaResolveError));
                        }
                    }
                    else {
                        var semanticErrors = jsonDocument.validate(textDocument, schema.schema);
                        if (semanticErrors) {
                            semanticErrors.forEach(addProblem);
                        }
                    }
                    if (schemaAllowsComments(schema.schema)) {
                        commentSeverity = void 0;
                    }
                    if (schemaAllowsTrailingCommas(schema.schema)) {
                        trailingCommaSeverity = void 0;
                    }
                }
                for (var _i = 0, _a = jsonDocument.syntaxErrors; _i < _a.length; _i++) {
                    var p = _a[_i];
                    if (p.code === jsonLanguageTypes_1.ErrorCode.TrailingComma) {
                        if (typeof trailingCommaSeverity !== 'number') {
                            continue;
                        }
                        p.severity = trailingCommaSeverity;
                    }
                    addProblem(p);
                }
                if (typeof commentSeverity === 'number') {
                    var message_1 = localize('InvalidCommentToken', 'Comments are not permitted in JSON.');
                    jsonDocument.comments.forEach(function (c) {
                        addProblem(jsonLanguageTypes_1.Diagnostic.create(c, message_1, commentSeverity, jsonLanguageTypes_1.ErrorCode.CommentNotPermitted));
                    });
                }
                return diagnostics;
            };
            if (schema) {
                var id = schema.id || ('schemaservice://untitled/' + idCounter++);
                return this.jsonSchemaService.resolveSchemaContent(new jsonSchemaService_1.UnresolvedSchema(schema), id, {}).then(function (resolvedSchema) {
                    return getDiagnostics(resolvedSchema);
                });
            }
            return this.jsonSchemaService.getSchemaForResource(textDocument.uri, jsonDocument).then(function (schema) {
                return getDiagnostics(schema);
            });
        };
        return JSONValidation;
    }());
    exports.JSONValidation = JSONValidation;
    var idCounter = 0;
    function schemaAllowsComments(schemaRef) {
        if (schemaRef && typeof schemaRef === 'object') {
            if (objects_1.isBoolean(schemaRef.allowComments)) {
                return schemaRef.allowComments;
            }
            if (schemaRef.allOf) {
                for (var _i = 0, _a = schemaRef.allOf; _i < _a.length; _i++) {
                    var schema = _a[_i];
                    var allow = schemaAllowsComments(schema);
                    if (objects_1.isBoolean(allow)) {
                        return allow;
                    }
                }
            }
        }
        return undefined;
    }
    function schemaAllowsTrailingCommas(schemaRef) {
        if (schemaRef && typeof schemaRef === 'object') {
            if (objects_1.isBoolean(schemaRef.allowTrailingCommas)) {
                return schemaRef.allowTrailingCommas;
            }
            if (objects_1.isBoolean(schemaRef['allowsTrailingCommas'])) { // deprecated
                return schemaRef['allowsTrailingCommas'];
            }
            if (schemaRef.allOf) {
                for (var _i = 0, _a = schemaRef.allOf; _i < _a.length; _i++) {
                    var schema = _a[_i];
                    var allow = schemaAllowsTrailingCommas(schema);
                    if (objects_1.isBoolean(allow)) {
                        return allow;
                    }
                }
            }
        }
        return undefined;
    }
    function toDiagnosticSeverity(severityLevel) {
        switch (severityLevel) {
            case 'error': return jsonLanguageTypes_1.DiagnosticSeverity.Error;
            case 'warning': return jsonLanguageTypes_1.DiagnosticSeverity.Warning;
            case 'ignore': return void 0;
        }
        return void 0;
    }
});
//# sourceMappingURL=jsonValidation.js.map