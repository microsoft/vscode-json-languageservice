/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import Parser = require('../parser/jsonParser');
import SchemaService = require('./jsonSchemaService');
import {JSONSchema} from '../jsonSchema';
import {JSONWorkerContribution, CompletionsCollector} from '../jsonContributions';
import {PromiseConstructor, Thenable} from '../jsonLanguageService';

import {CompletionItem, CompletionItemKind, CompletionList, TextDocument, Position, Range, TextEdit} from 'vscode-languageserver-types';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();


export class JSONCompletion {

	private schemaService: SchemaService.IJSONSchemaService;
	private contributions: JSONWorkerContribution[];
	private promise: PromiseConstructor;

	constructor(schemaService: SchemaService.IJSONSchemaService, contributions: JSONWorkerContribution[] = [], promiseConstructor?: PromiseConstructor) {
		this.schemaService = schemaService;
		this.contributions = contributions;
		this.promise = promiseConstructor || Promise;
	}

	public doResolve(item: CompletionItem) : Thenable<CompletionItem> {
		for (let i = this.contributions.length - 1; i >= 0; i--) {
			if (this.contributions[i].resolveCompletion) {
				let resolver = this.contributions[i].resolveCompletion(item);
				if (resolver) {
					return resolver;
				}
			}
		}
		return this.promise.resolve(item);
	}

	public doComplete(document: TextDocument, position: Position, doc: Parser.JSONDocument): Thenable<CompletionList> {

		let offset = document.offsetAt(position);
		let node = doc.getNodeFromOffsetEndInclusive(offset);

		let currentWord = this.getCurrentWord(document, offset);
		let overwriteRange = null;
		let filterText = void 0;
		let result: CompletionList = {
			items: [],
			isIncomplete: false
		};

		if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null')) {
			overwriteRange = Range.create(document.positionAt(node.start), document.positionAt(node.end));
			filterText = document.getText().substring(node.start, offset);
		} else {
			overwriteRange = Range.create(document.positionAt(offset - currentWord.length), position);
			filterText = document.getText().substring(offset - currentWord.length, offset);
		}

		let proposed: { [key: string]: boolean } = {};
		let collector: CompletionsCollector = {
			add: (suggestion: CompletionItem) => {
				if (!proposed[suggestion.label]) {
					proposed[suggestion.label] = true;
					if (overwriteRange) {
						suggestion.textEdit = TextEdit.replace(overwriteRange, suggestion.insertText);
					}

					result.items.push(suggestion);
				}
			},
			setAsIncomplete: () => {
				result.isIncomplete = true;
			},
			error: (message: string) => {
				console.error(message);
			},
			log: (message: string) => {
				console.log(message);
			},
			getNumberOfProposals: () => {
				return result.items.length;
			}
		};

		return this.schemaService.getSchemaForResource(document.uri, doc).then((schema) => {
			let collectionPromises: Thenable<any>[] = [];

			let addValue = true;
			let currentKey = '';

			let currentProperty: Parser.PropertyASTNode = null;
			if (node) {

				if (node.type === 'string') {
					let stringNode = <Parser.StringASTNode>node;
					if (stringNode.isKey) {
						addValue = !(node.parent && ((<Parser.PropertyASTNode>node.parent).value));
						currentProperty = node.parent ? <Parser.PropertyASTNode>node.parent : null;
						currentKey = document.getText().substring(node.start + 1, node.end - 1);
						if (node.parent) {
							node = node.parent.parent;
						}
					}
				}
			}

			// proposals for properties
			if (node && node.type === 'object') {
				// don't suggest keys when the cursor is just before the opening curly brace
				if (node.start === offset) {
					return result;
				}
				// don't suggest properties that are already present
				let properties = (<Parser.ObjectASTNode>node).properties;
				properties.forEach(p => {
					if (!currentProperty || currentProperty !== p) {
						proposed[p.key.value] = true;
					}
				});
				
				let isLast = properties.length === 0 || offset >= properties[properties.length - 1].start;
				if (schema) {
					// property proposals with schema
					this.getPropertyCompletions(schema, doc, node, addValue, isLast, collector);
				} else {
					// property proposals without schema
					this.getSchemaLessPropertyCompletions(doc, node, currentKey, currentWord, isLast, collector);
				}

				let location = node.getPath();
				this.contributions.forEach((contribution) => {
					let collectPromise = contribution.collectPropertyCompletions(document.uri, location, currentWord, addValue, isLast, collector);
					if (collectPromise) {
						collectionPromises.push(collectPromise);
					}
				});
				if ((!schema && currentWord.length > 0 && document.getText().charAt(offset - currentWord.length - 1) !== '"')) {
					collector.add({ kind: CompletionItemKind.Property, label: this.getLabelForValue(currentWord), insertText: this.getInsertTextForProperty(currentWord, null, false, isLast), documentation: '' });
				}
			}

			// proposals for values
			if (node && (node.type === 'string' || node.type === 'number' || node.type === 'boolean' || node.type === 'null')) {
				node = node.parent;
			}

			let types: {[type:string]: boolean} = {};
			if (schema) {
				// value proposals with schema
				this.getValueCompletions(schema, doc, node, offset, collector, types);
			} else {
				// value proposals without schema
				this.getSchemaLessValueCompletions(doc, node, offset, document, collector);
			}

			if (!node) {
				this.contributions.forEach((contribution) => {
					let collectPromise = contribution.collectDefaultCompletions(document.uri, collector);
					if (collectPromise) {
						collectionPromises.push(collectPromise);
					}
				});
			} else {
				if ((node.type === 'property') && offset > (<Parser.PropertyASTNode> node).colonOffset) {
					let parentKey = (<Parser.PropertyASTNode>node).key.value;

					let valueNode = (<Parser.PropertyASTNode> node).value;
					if (!valueNode || offset <= valueNode.end) {
						let location = node.parent.getPath();
						this.contributions.forEach((contribution) => {
							let collectPromise = contribution.collectValueCompletions(document.uri, location, parentKey, collector);
							if (collectPromise) {
								collectionPromises.push(collectPromise);
							}
						});
					}
				}
			}
			return this.promise.all(collectionPromises).then(() => {
				if (collector.getNumberOfProposals() === 0) {
					this.addFillerValueCompletions(types, collector);
				}
				return result;
			});
		});
	}

	private getPropertyCompletions(schema: SchemaService.ResolvedSchema, doc: Parser.JSONDocument, node: Parser.ASTNode, addValue: boolean, isLast: boolean, collector: CompletionsCollector): void {
		let matchingSchemas: Parser.IApplicableSchema[] = [];
		doc.validate(schema.schema, matchingSchemas, node.start);
		matchingSchemas.forEach((s) => {
			if (s.node === node && !s.inverted) {
				let schemaProperties = s.schema.properties;
				if (schemaProperties) {
					Object.keys(schemaProperties).forEach((key: string) => {
						let propertySchema = schemaProperties[key];
						collector.add({ kind: CompletionItemKind.Property, label: key, insertText: this.getInsertTextForProperty(key, propertySchema, addValue, isLast), filterText: this.getFilterTextForValue(key), documentation: propertySchema.description || '' });
					});
				}
			}
		});
	}

	private getSchemaLessPropertyCompletions(doc: Parser.JSONDocument, node: Parser.ASTNode, currentKey: string, currentWord: string, isLast: boolean, collector: CompletionsCollector): void {
		let collectCompletionsForSimilarObject = (obj: Parser.ObjectASTNode) => {
			obj.properties.forEach((p) => {
				let key = p.key.value;
				collector.add({ kind: CompletionItemKind.Property, label: key, insertText: this.getInsertTextForValue(key), filterText: this.getFilterTextForValue(key), documentation: '' });
			});
		};
		if (node.parent) {
			if (node.parent.type === 'property') {
				// if the object is a property value, check the tree for other objects that hang under a property of the same name
				let parentKey = (<Parser.PropertyASTNode>node.parent).key.value;
				doc.visit((n) => {
					let p = <Parser.PropertyASTNode> n;
					if (n.type === 'property' && n !== node.parent && p.key.value === parentKey && p.value && p.value.type === 'object') {
						collectCompletionsForSimilarObject(<Parser.ObjectASTNode>p.value);
					}
					return true;
				});
			} else if (node.parent.type === 'array') {
				// if the object is in an array, use all other array elements as similar objects
				(<Parser.ArrayASTNode>node.parent).items.forEach((n) => {
					if (n.type === 'object' && n !== node) {
						collectCompletionsForSimilarObject(<Parser.ObjectASTNode>n);
					}
				});
			}
		} else if (node.type === 'object') {
			collector.add({ kind: CompletionItemKind.Property, label: '$schema', insertText: this.getInsertTextForProperty('$schema', null, true, isLast), documentation: '' , filterText: this.getFilterTextForValue("$schema")});
		}
	}

	private getSchemaLessValueCompletions(doc: Parser.JSONDocument, node: Parser.ASTNode, offset: number, document: TextDocument, collector: CompletionsCollector): void {
		let collectSuggestionsForValues = (value: Parser.ASTNode) => {
			if (!value.parent.contains(offset, true)) {
				collector.add({ kind: this.getSuggestionKind(value.type), label: this.getLabelTextForMatchingNode(value, document), insertText: this.getInsertTextForMatchingNode(value, document), documentation: '' });
			}
			if (value.type === 'boolean') {
				this.addBooleanValueCompletion(!value.getValue(), collector);
			}
		};
		if (!node) {
			collector.add({ kind: this.getSuggestionKind('object'), label: 'Empty object', insertText: this.getInsertTextForValue({}), documentation: '' });
			collector.add({ kind: this.getSuggestionKind('array'), label: 'Empty array', insertText: this.getInsertTextForValue([]), documentation: '' });
		} else {
			if (node.type === 'property') {
				let propertyNode = <Parser.PropertyASTNode> node;
				if (offset > propertyNode.colonOffset) {
					
					let valueNode = propertyNode.value;
					if (valueNode && (offset > valueNode.end || valueNode.type === 'object' || valueNode.type === 'array')) {
						return;
					}
					// suggest values at the same key
					let parentKey = propertyNode.key.value;
					doc.visit(n => {
						let p = <Parser.PropertyASTNode> n;
						if (n.type === 'property' && p.key.value === parentKey && p.value) {
							collectSuggestionsForValues(p.value);
						}
						return true;
					});
					if (parentKey === '$schema' && node.parent && !node.parent.parent) {
						this.addDollarSchemaCompletions(collector);
					}
				}
			}
			if (node.type === 'array') {
				if (node.parent && node.parent.type === 'property') {
					// suggest items of an array at the same key
					let parentKey = (<Parser.PropertyASTNode>node.parent).key.value;
					doc.visit((n) => {
						let p = <Parser.PropertyASTNode> n;
						if (n.type === 'property' && p.key.value === parentKey && p.value && p.value.type === 'array') {
							((<Parser.ArrayASTNode>p.value).items).forEach((n) => {
								collectSuggestionsForValues(<Parser.ObjectASTNode>n);
							});
						}
						return true;
					});
				} else {
					// suggest items in the same array
					(<Parser.ArrayASTNode>node).items.forEach((n) => {
						collectSuggestionsForValues(<Parser.ObjectASTNode>n);
					});
				}
			}
		}
	}


	private getValueCompletions(schema: SchemaService.ResolvedSchema, doc: Parser.JSONDocument, node: Parser.ASTNode, offset: number, collector: CompletionsCollector, types: {[type:string]: boolean}): void {
		if (!node) {
			this.addSchemaValueCompletions(schema.schema, collector, types);
		} else {
			
			let parentKey: string = null;
			if (node && (node.type === 'property') && offset > (<Parser.PropertyASTNode>node).colonOffset) {
				let valueNode = (<Parser.PropertyASTNode>node).value;
				if (valueNode && offset > valueNode.end) {
					return; // we are past the value node
				}
				parentKey = (<Parser.PropertyASTNode>node).key.value;
				node = node.parent;
			}
			if (node && (parentKey !== null || node.type === 'array')) {
				let matchingSchemas: Parser.IApplicableSchema[] = [];
				doc.validate(schema.schema, matchingSchemas, node.start);

				matchingSchemas.forEach(s => {
					if (s.node === node && !s.inverted && s.schema) {
						if (s.schema.items) {
							this.addSchemaValueCompletions(s.schema.items, collector, types);
						}
						if (s.schema.properties) {
							let propertySchema = s.schema.properties[parentKey];
							if (propertySchema) {
								this.addSchemaValueCompletions(propertySchema, collector, types);
							}
						}
					}
				});
				if (parentKey === '$schema' && !node.parent) {
					this.addDollarSchemaCompletions(collector);
				}
				if (types['boolean']) {
					this.addBooleanValueCompletion(true, collector);
					this.addBooleanValueCompletion(false, collector);
				}
				if (types['null']) {
					this.addNullValueCompletion(collector);
				}
			}
		}
	}

	private addSchemaValueCompletions(schema: JSONSchema, collector: CompletionsCollector, types: {[type:string]: boolean}): void {
		this.addDefaultValueCompletions(schema, collector);
		this.addEnumValueCompletions(schema, collector);
		this.collectTypes(schema, types);
		if (Array.isArray(schema.allOf)) {
			schema.allOf.forEach(s => this.addSchemaValueCompletions(s, collector, types));
		}
		if (Array.isArray(schema.anyOf)) {
			schema.anyOf.forEach(s => this.addSchemaValueCompletions(s, collector, types));
		}
		if (Array.isArray(schema.oneOf)) {
			schema.oneOf.forEach(s => this.addSchemaValueCompletions(s, collector, types));
		}
	}

	private addDefaultValueCompletions(schema: JSONSchema, collector: CompletionsCollector, arrayDepth = 0): void {
		let hasProposals = false;
		if (schema.default) {
			let type = schema.type;
			let value = schema.default;
			for (let i = arrayDepth; i > 0; i--) {
				value = [ value ];
				type = 'array';
			}
			collector.add({
				kind: this.getSuggestionKind(type),
				label: this.getLabelForValue(value),
				insertText: this.getInsertTextForValue(value),
				detail: localize('json.suggest.default', 'Default value'),
			});
			hasProposals = true;
		}
		if (Array.isArray(schema.defaultSnippets)) {
			schema.defaultSnippets.forEach(s => {
				let value = s.body;
				let type = schema.type;
				for (let i = arrayDepth; i > 0; i--) {
					value = [ value ];
					type = 'array';
				}
				let insertText = this.getInsertTextForSnippetValue(value);
				collector.add({
					kind: this.getSuggestionKind(type),
					label: s.label || this.getLabelForSnippetValue(value),
					documentation: s.description,
					insertText: insertText,
					filterText: insertText
				});
				hasProposals = true;
			});
		}
		if (!hasProposals && schema.items && !Array.isArray(schema.items)) {
			this.addDefaultValueCompletions(schema.items, collector, arrayDepth + 1);
		}
	}

	private addEnumValueCompletions(schema: JSONSchema, collector: CompletionsCollector): void {
		if (Array.isArray(schema.enum)) {
			schema.enum.forEach((enm) => collector.add({ kind: this.getSuggestionKind(schema.type), label: this.getLabelForValue(enm), insertText: this.getInsertTextForValue(enm), documentation: '' }));
		}
	}

	private collectTypes(schema: JSONSchema, types: {[type:string]: boolean}) {
		let type = schema.type;
		if (Array.isArray(type)) {
			type.forEach(t => types[t] = true);
		} else {
			types[type] = true;
		}
	}

	private addFillerValueCompletions(types: {[type:string]: boolean}, collector: CompletionsCollector): void {
		if (types['object']) {
			collector.add({ kind: this.getSuggestionKind('object'), label: '{}', insertText: this.getInsertTextForGuessedValue({}), detail: localize('defaults.object', 'New object'),  documentation: '' });
		}
		if (types['array']) {
			collector.add({ kind: this.getSuggestionKind('array'), label: '[]', insertText: this.getInsertTextForGuessedValue([]), detail: localize('defaults.array', 'New array'),  documentation: '' });
		}
	}

	private addBooleanValueCompletion(value: boolean, collector: CompletionsCollector): void {
		collector.add({ kind: this.getSuggestionKind('boolean'), label: value ? 'true' : 'false', insertText: this.getInsertTextForValue(value), documentation: '' });
	}

	private addNullValueCompletion(collector: CompletionsCollector): void {
		collector.add({ kind: this.getSuggestionKind('null'), label: 'null', insertText: 'null', documentation: '' });
	}

	private addDollarSchemaCompletions(collector: CompletionsCollector) : void  {
		let schemaIds = this.schemaService.getRegisteredSchemaIds(schema => schema === 'http' || schema === 'https');
		schemaIds.forEach(schemaId => collector.add({ kind: CompletionItemKind.Module, label: this.getLabelForValue(schemaId), filterText: JSON.stringify(schemaId), insertText: this.getInsertTextForValue(schemaId), documentation: '' }));
	}	

	private getLabelForValue(value: any): string {
		let label = JSON.stringify(value);
		if (label.length > 57) {
			return label.substr(0, 57).trim() + '...';
		}
		return label;
	}

	private getFilterTextForValue(value) : string {
		return JSON.stringify(value);
	}

	private getLabelForSnippetValue(value: any): string {
		let label = JSON.stringify(value);
		label = label.replace(/\{\{|\}\}/g, '');
		if (label.length > 57) {
			return label.substr(0, 57).trim() + '...';
		}
		return label;
	}

	private getInsertTextForValue(value: any): string {
		var text = JSON.stringify(value, null, '\t');
		if (text === '{}') {
			return '{\n\t{{}}\n}';
		} else if (text === '[]') {
			return '[\n\t{{}}\n]';
		}
		text = text.replace(/[\\\{\}]/g, '\\$&');
		return text;
	}

	private getInsertTextForSnippetValue(value: any): string {
		return JSON.stringify(value, null, '\t');
	}

	private templateVarIdCounter = 0;

	private getInsertTextForGuessedValue(value: any): string {
		let snippet = this.getInsertTextForValue(value);
		switch (typeof value) {
			case 'object':
				if (value === null) {
					return '{{null}}';
				}
				return snippet;
			case 'string':
				snippet = snippet.substr(1, snippet.length - 2); // remove quotes
				snippet = snippet.replace(/^(\w+:.*)$/, String(this.templateVarIdCounter++) + ':$1'); // add pseudo variable id to prevent clash with named snippet variables
				return '"{{' + snippet + '}}"';
			case 'number':
			case 'integer':
			case 'boolean':
				return '{{' + snippet + '}}';
		}
		return snippet;
	}

	private getSuggestionKind(type: any): CompletionItemKind {
		if (Array.isArray(type)) {
			let array = <any[]>type;
			type = array.length > 0 ? array[0] : null;
		}
		if (!type) {
			return CompletionItemKind.Value;
		}
		switch (type) {
			case 'string': return CompletionItemKind.Value;
			case 'object': return CompletionItemKind.Module;
			case 'property': return CompletionItemKind.Property;
			default: return CompletionItemKind.Value;
		}
	}

	private getLabelTextForMatchingNode(node: Parser.ASTNode, document: TextDocument): string {
		switch (node.type) {
			case 'array':
				return '[]';
			case 'object':
				return '{}';
			default:
				let content = document.getText().substr(node.start, node.end - node.start);
				return content;
		}
	}

	private getInsertTextForMatchingNode(node: Parser.ASTNode, document: TextDocument): string {
		switch (node.type) {
			case 'array':
				return this.getInsertTextForValue([]);
			case 'object':
				return this.getInsertTextForValue({});
			default:
				let content = document.getText().substr(node.start, node.end - node.start);
				return content;
		}
	}

	private getInsertTextForProperty(key: string, propertySchema: JSONSchema, addValue: boolean, isLast: boolean): string {
		
		let result = this.getInsertTextForValue(key);
		if (!addValue) {
			return result;
		}
		result += ': ';

		if (propertySchema) {
			let defaultVal = propertySchema.default;
			if (typeof defaultVal !== 'undefined') {
				result = result + this.getInsertTextForGuessedValue(defaultVal);
			} else if (propertySchema.enum && propertySchema.enum.length > 0) {
				result = result + this.getInsertTextForGuessedValue(propertySchema.enum[0]);
			} else {
				var type = Array.isArray(propertySchema.type) ? propertySchema.type[0] : propertySchema.type;
				switch (type) {
					case 'boolean':
						result += '{{false}}';
						break;
					case 'string':
						result += '"{{}}"';
						break;
					case 'object':
						result += '{\n\t{{}}\n}';
						break;
					case 'array':
						result += '[\n\t{{}}\n]';
						break;
					case 'number':
					case 'integer':
						result += '{{0}}';
						break;
					case 'null':
						result += '{{null}}';
						break;
					default:
						return result;
				}
			}
		} else {
			result += '{{}}';
		}
		if (!isLast) {
			result += ',';
		}
		return result;
	}

	private getCurrentWord(document: TextDocument, offset: number) {
		var i = offset - 1;
		var text = document.getText();
		while (i >= 0 && ' \t\n\r\v":{[,]}'.indexOf(text.charAt(i)) === -1) {
			i--;
		}
		return text.substring(i+1, offset);
	}
}