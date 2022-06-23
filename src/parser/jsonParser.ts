/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Json from 'jsonc-parser';
import { JSONSchema, JSONSchemaMap, JSONSchemaRef } from '../jsonSchema';
import { isNumber, equals, isBoolean, isString, isDefined, isObject } from '../utils/objects';
import { extendedRegExp } from '../utils/strings';
import { TextDocument, ASTNode, ObjectASTNode, ArrayASTNode, BooleanASTNode, NumberASTNode, StringASTNode, NullASTNode, PropertyASTNode, JSONPath, ErrorCode, Diagnostic, DiagnosticSeverity, Range } from '../jsonLanguageTypes';

import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export interface IRange {
	offset: number;
	length: number;
}

const formats = {
	'color-hex': { errorMessage: localize('colorHexFormatWarning', 'Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.'), pattern: /^#([0-9A-Fa-f]{3,4}|([0-9A-Fa-f]{2}){3,4})$/ },
	'date-time': { errorMessage: localize('dateTimeFormatWarning', 'String is not a RFC3339 date-time.'), pattern: /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)([01][0-9]|2[0-3]):([0-5][0-9]))$/i },
	'date': { errorMessage: localize('dateFormatWarning', 'String is not a RFC3339 date.'), pattern: /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/i },
	'time': { errorMessage: localize('timeFormatWarning', 'String is not a RFC3339 time.'), pattern: /^([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)([01][0-9]|2[0-3]):([0-5][0-9]))$/i },
	'email': { errorMessage: localize('emailFormatWarning', 'String is not an e-mail address.'), pattern: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}))$/ },
	'hostname': { errorMessage: localize('hostnameFormatWarning', 'String is not a hostname.'), pattern: /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i },
	'ipv4': { errorMessage: localize('ipv4FormatWarning', 'String is not an IPv4 address.'), pattern: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/ },
	'ipv6': { errorMessage: localize('ipv6FormatWarning', 'String is not an IPv6 address.'), pattern: /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i },
};

export interface IProblem {
	location: IRange;
	severity?: DiagnosticSeverity;
	code?: ErrorCode;
	message: string;
}

export abstract class ASTNodeImpl {

	public readonly abstract type: 'object' | 'property' | 'array' | 'number' | 'boolean' | 'null' | 'string';

	public offset: number;
	public length: number;
	public readonly parent: ASTNode | undefined;

	constructor(parent: ASTNode | undefined, offset: number, length: number = 0) {
		this.offset = offset;
		this.length = length;
		this.parent = parent;
	}

	public get children(): ASTNode[] {
		return [];
	}

	public toString(): string {
		return 'type: ' + this.type + ' (' + this.offset + '/' + this.length + ')' + (this.parent ? ' parent: {' + this.parent.toString() + '}' : '');
	}
}

export class NullASTNodeImpl extends ASTNodeImpl implements NullASTNode {

	public type: 'null' = 'null';
	public value: null = null;
	constructor(parent: ASTNode | undefined, offset: number) {
		super(parent, offset);
	}
}

export class BooleanASTNodeImpl extends ASTNodeImpl implements BooleanASTNode {

	public type: 'boolean' = 'boolean';
	public value: boolean;

	constructor(parent: ASTNode | undefined, boolValue: boolean, offset: number) {
		super(parent, offset);
		this.value = boolValue;
	}
}

export class ArrayASTNodeImpl extends ASTNodeImpl implements ArrayASTNode {

	public type: 'array' = 'array';
	public items: ASTNode[];

	constructor(parent: ASTNode | undefined, offset: number) {
		super(parent, offset);
		this.items = [];
	}

	public get children(): ASTNode[] {
		return this.items;
	}
}

export class NumberASTNodeImpl extends ASTNodeImpl implements NumberASTNode {

	public type: 'number' = 'number';
	public isInteger: boolean;
	public value: number;

	constructor(parent: ASTNode | undefined, offset: number) {
		super(parent, offset);
		this.isInteger = true;
		this.value = Number.NaN;
	}
}

export class StringASTNodeImpl extends ASTNodeImpl implements StringASTNode {
	public type: 'string' = 'string';
	public value: string;

	constructor(parent: ASTNode | undefined, offset: number, length?: number) {
		super(parent, offset, length);
		this.value = '';
	}
}

export class PropertyASTNodeImpl extends ASTNodeImpl implements PropertyASTNode {
	public type: 'property' = 'property';
	public keyNode: StringASTNode;
	public valueNode?: ASTNode;
	public colonOffset: number;

	constructor(parent: ObjectASTNode | undefined, offset: number, keyNode: StringASTNode) {
		super(parent, offset);
		this.colonOffset = -1;
		this.keyNode = keyNode;
	}

	public get children(): ASTNode[] {
		return this.valueNode ? [this.keyNode, this.valueNode] : [this.keyNode];
	}
}

export class ObjectASTNodeImpl extends ASTNodeImpl implements ObjectASTNode {
	public type: 'object' = 'object';
	public properties: PropertyASTNode[];

	constructor(parent: ASTNode | undefined, offset: number) {
		super(parent, offset);

		this.properties = [];
	}

	public get children(): ASTNode[] {
		return this.properties;
	}

}
export function asSchema(schema: JSONSchemaRef): JSONSchema;
export function asSchema(schema: JSONSchemaRef | undefined): JSONSchema | undefined;
export function asSchema(schema: JSONSchemaRef | undefined): JSONSchema | undefined {
	if (isBoolean(schema)) {
		return schema ? {} : { "not": {} };
	}
	return schema;
}

export interface JSONDocumentConfig {
	collectComments?: boolean;
}

export interface IApplicableSchema {
	node: ASTNode;
	inverted?: boolean;
	schema: JSONSchema;
}

export enum EnumMatch {
	Key, Enum
}

export interface ISchemaCollector {
	schemas: IApplicableSchema[];
	add(schema: IApplicableSchema): void;
	merge(other: ISchemaCollector): void;
	include(node: ASTNode): boolean;
	newSub(): ISchemaCollector;
}

class SchemaCollector implements ISchemaCollector {
	schemas: IApplicableSchema[] = [];
	constructor(private focusOffset = -1, private exclude?: ASTNode) {
	}
	add(schema: IApplicableSchema) {
		this.schemas.push(schema);
	}
	merge(other: ISchemaCollector) {
		Array.prototype.push.apply(this.schemas, other.schemas);
	}
	include(node: ASTNode) {
		return (this.focusOffset === -1 || contains(node, this.focusOffset)) && (node !== this.exclude);
	}
	newSub(): ISchemaCollector {
		return new SchemaCollector(-1, this.exclude);
	}
}

class NoOpSchemaCollector implements ISchemaCollector {
	private constructor() { }
	get schemas() { return []; }
	add(schema: IApplicableSchema) { }
	merge(other: ISchemaCollector) { }
	include(node: ASTNode) { return true; }
	newSub(): ISchemaCollector { return this; }

	static instance = new NoOpSchemaCollector();
}

export class ValidationResult {
	public problems: IProblem[];

	public propertiesMatches: number;
	public processedProperties: Set<string>;
	public propertiesValueMatches: number;
	public primaryValueMatches: number;
	public enumValueMatch: boolean;
	public enumValues: any[] | undefined;

	constructor() {
		this.problems = [];
		this.propertiesMatches = 0;
		this.processedProperties = new Set();
		this.propertiesValueMatches = 0;
		this.primaryValueMatches = 0;
		this.enumValueMatch = false;
		this.enumValues = undefined;
	}

	public hasProblems(): boolean {
		return !!this.problems.length;
	}

	public mergeAll(validationResults: ValidationResult[]): void {
		for (const validationResult of validationResults) {
			this.merge(validationResult);
		}
	}

	public merge(validationResult: ValidationResult): void {
		this.problems = this.problems.concat(validationResult.problems);
	}

	public mergeEnumValues(validationResult: ValidationResult): void {
		if (!this.enumValueMatch && !validationResult.enumValueMatch && this.enumValues && validationResult.enumValues) {
			this.enumValues = this.enumValues.concat(validationResult.enumValues);
			for (const error of this.problems) {
				if (error.code === ErrorCode.EnumValueMismatch) {
					error.message = localize('enumWarning', 'Value is not accepted. Valid values: {0}.', this.enumValues.map(v => JSON.stringify(v)).join(', '));
				}
			}
		}
	}

	public mergePropertyMatch(propertyValidationResult: ValidationResult): void {
		this.merge(propertyValidationResult);
		this.propertiesMatches++;
		if (propertyValidationResult.enumValueMatch || !propertyValidationResult.hasProblems() && propertyValidationResult.propertiesMatches) {
			this.propertiesValueMatches++;
		}
		if (propertyValidationResult.enumValueMatch && propertyValidationResult.enumValues && propertyValidationResult.enumValues.length === 1) {
			this.primaryValueMatches++;
		}
	}

	public mergeProcessedProperties(validationResult: ValidationResult): void {
		validationResult.processedProperties.forEach(p => this.processedProperties.add(p));
	}

	public compare(other: ValidationResult): number {
		const hasProblems = this.hasProblems();
		if (hasProblems !== other.hasProblems()) {
			return hasProblems ? -1 : 1;
		}
		if (this.enumValueMatch !== other.enumValueMatch) {
			return other.enumValueMatch ? -1 : 1;
		}
		if (this.primaryValueMatches !== other.primaryValueMatches) {
			return this.primaryValueMatches - other.primaryValueMatches;
		}
		if (this.propertiesValueMatches !== other.propertiesValueMatches) {
			return this.propertiesValueMatches - other.propertiesValueMatches;
		}
		return this.propertiesMatches - other.propertiesMatches;
	}

}

export function newJSONDocument(root: ASTNode, diagnostics: Diagnostic[] = []) {
	return new JSONDocument(root, diagnostics, []);
}

export function getNodeValue(node: ASTNode): any {
	return Json.getNodeValue(node);
}

export function getNodePath(node: ASTNode): JSONPath {
	return Json.getNodePath(node);
}

export function contains(node: ASTNode, offset: number, includeRightBound = false): boolean {
	return offset >= node.offset && offset < (node.offset + node.length) || includeRightBound && offset === (node.offset + node.length);
}

export class JSONDocument {

	constructor(public readonly root: ASTNode | undefined, public readonly syntaxErrors: Diagnostic[] = [], public readonly comments: Range[] = []) {
	}

	public getNodeFromOffset(offset: number, includeRightBound = false): ASTNode | undefined {
		if (this.root) {
			return <ASTNode>Json.findNodeAtOffset(this.root, offset, includeRightBound);
		}
		return undefined;
	}

	public visit(visitor: (node: ASTNode) => boolean): void {
		if (this.root) {
			const doVisit = (node: ASTNode): boolean => {
				let ctn = visitor(node);
				const children = node.children;
				if (Array.isArray(children)) {
					for (let i = 0; i < children.length && ctn; i++) {
						ctn = doVisit(children[i]);
					}
				}
				return ctn;
			};
			doVisit(this.root);
		}
	}

	public validate(textDocument: TextDocument, schema: JSONSchema | undefined, severity: DiagnosticSeverity = DiagnosticSeverity.Warning): Diagnostic[] | undefined {
		if (this.root && schema) {
			const validationResult = new ValidationResult();
			validate(this.root, schema, validationResult, NoOpSchemaCollector.instance);
			return validationResult.problems.map(p => {
				const range = Range.create(textDocument.positionAt(p.location.offset), textDocument.positionAt(p.location.offset + p.location.length));
				return Diagnostic.create(range, p.message, p.severity ?? severity, p.code);
			});
		}
		return undefined;
	}

	public getMatchingSchemas(schema: JSONSchema, focusOffset: number = -1, exclude?: ASTNode): IApplicableSchema[] {
		const matchingSchemas = new SchemaCollector(focusOffset, exclude);
		if (this.root && schema) {
			validate(this.root, schema, new ValidationResult(), matchingSchemas);
		}
		return matchingSchemas.schemas;
	}
}

function validate(n: ASTNode | undefined, schema: JSONSchema, validationResult: ValidationResult, matchingSchemas: ISchemaCollector): void {

	if (!n || !matchingSchemas.include(n)) {
		return;
	}
	if (n.type === 'property') {
		return validate(n.valueNode, schema, validationResult, matchingSchemas);
	}
	const node = n;
	_validateNode();

	switch (node.type) {
		case 'object':
			_validateObjectNode(node);
			break;
		case 'array':
			_validateArrayNode(node);
			break;
		case 'string':
			_validateStringNode(node);
			break;
		case 'number':
			_validateNumberNode(node);
			break;
	}

	matchingSchemas.add({ node: node, schema: schema });

	function _validateNode() {

		function matchesType(type: string) {
			return node.type === type || (type === 'integer' && node.type === 'number' && node.isInteger);
		}

		if (Array.isArray(schema.type)) {
			if (!schema.type.some(matchesType)) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: schema.errorMessage || localize('typeArrayMismatchWarning', 'Incorrect type. Expected one of {0}.', (<string[]>schema.type).join(', '))
				});
			}
		}
		else if (schema.type) {
			if (!matchesType(schema.type)) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: schema.errorMessage || localize('typeMismatchWarning', 'Incorrect type. Expected "{0}".', schema.type)
				});
			}
		}
		if (Array.isArray(schema.allOf)) {
			for (const subSchemaRef of schema.allOf) {
				validate(node, asSchema(subSchemaRef), validationResult, matchingSchemas);
			}
		}
		const notSchema = asSchema(schema.not);
		if (notSchema) {
			const subValidationResult = new ValidationResult();
			const subMatchingSchemas = matchingSchemas.newSub();
			validate(node, notSchema, subValidationResult, subMatchingSchemas);
			if (!subValidationResult.hasProblems()) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: localize('notSchemaWarning', "Matches a schema that is not allowed.")
				});
			}
			for (const ms of subMatchingSchemas.schemas) {
				ms.inverted = !ms.inverted;
				matchingSchemas.add(ms);
			}
		}

		const testAlternatives = (alternatives: JSONSchemaRef[], maxOneMatch: boolean) => {
			const matches = [];

			// remember the best match that is used for error messages
			let bestMatch: { schema: JSONSchema; validationResult: ValidationResult; matchingSchemas: ISchemaCollector; } | undefined = undefined;
			for (const subSchemaRef of alternatives) {
				const subSchema = asSchema(subSchemaRef);
				const subValidationResult = new ValidationResult();
				const subMatchingSchemas = matchingSchemas.newSub();
				validate(node, subSchema, subValidationResult, subMatchingSchemas);
				if (!subValidationResult.hasProblems()) {
					matches.push(subSchema);
				}
				if (!bestMatch) {
					bestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
				} else {
					if (!maxOneMatch && !subValidationResult.hasProblems() && !bestMatch.validationResult.hasProblems()) {
						// no errors, both are equally good matches
						bestMatch.matchingSchemas.merge(subMatchingSchemas);
						bestMatch.validationResult.propertiesMatches += subValidationResult.propertiesMatches;
						bestMatch.validationResult.propertiesValueMatches += subValidationResult.propertiesValueMatches;
						bestMatch.validationResult.mergeProcessedProperties(subValidationResult);
					} else {
						const compareResult = subValidationResult.compare(bestMatch.validationResult);
						if (compareResult > 0) {
							// our node is the best matching so far
							bestMatch = { schema: subSchema, validationResult: subValidationResult, matchingSchemas: subMatchingSchemas };
						} else if (compareResult === 0) {
							// there's already a best matching but we are as good
							bestMatch.matchingSchemas.merge(subMatchingSchemas);
							bestMatch.validationResult.mergeEnumValues(subValidationResult);
						}
					}
				}
			}

			if (matches.length > 1 && maxOneMatch) {
				validationResult.problems.push({
					location: { offset: node.offset, length: 1 },
					message: localize('oneOfWarning', "Matches multiple schemas when only one must validate.")
				});
			}
			if (bestMatch) {
				validationResult.merge(bestMatch.validationResult);
				validationResult.propertiesMatches += bestMatch.validationResult.propertiesMatches;
				validationResult.propertiesValueMatches += bestMatch.validationResult.propertiesValueMatches;
				validationResult.mergeProcessedProperties(bestMatch.validationResult);
				matchingSchemas.merge(bestMatch.matchingSchemas);
			}
			return matches.length;
		};
		if (Array.isArray(schema.anyOf)) {
			testAlternatives(schema.anyOf, false);
		}
		if (Array.isArray(schema.oneOf)) {
			testAlternatives(schema.oneOf, true);
		}

		const testBranch = (schema: JSONSchemaRef) => {
			const subValidationResult = new ValidationResult();
			const subMatchingSchemas = matchingSchemas.newSub();

			validate(node, asSchema(schema), subValidationResult, subMatchingSchemas);

			validationResult.merge(subValidationResult);
			validationResult.propertiesMatches += subValidationResult.propertiesMatches;
			validationResult.propertiesValueMatches += subValidationResult.propertiesValueMatches;
			validationResult.mergeProcessedProperties(subValidationResult);
			matchingSchemas.merge(subMatchingSchemas);
		};

		const testCondition = (ifSchema: JSONSchemaRef, thenSchema?: JSONSchemaRef, elseSchema?: JSONSchemaRef) => {
			const subSchema = asSchema(ifSchema);
			const subValidationResult = new ValidationResult();
			const subMatchingSchemas = matchingSchemas.newSub();

			validate(node, subSchema, subValidationResult, subMatchingSchemas);
			matchingSchemas.merge(subMatchingSchemas);
			validationResult.mergeProcessedProperties(subValidationResult);

			if (!subValidationResult.hasProblems()) {
				if (thenSchema) {
					testBranch(thenSchema);
				}
			} else if (elseSchema) {
				testBranch(elseSchema);
			}
		};

		const ifSchema = asSchema(schema.if);
		if (ifSchema) {
			testCondition(ifSchema, asSchema(schema.then), asSchema(schema.else));
		}

		if (Array.isArray(schema.enum)) {
			const val = getNodeValue(node);
			let enumValueMatch = false;
			for (const e of schema.enum) {
				if (equals(val, e)) {
					enumValueMatch = true;
					break;
				}
			}
			validationResult.enumValues = schema.enum;
			validationResult.enumValueMatch = enumValueMatch;
			if (!enumValueMatch) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					code: ErrorCode.EnumValueMismatch,
					message: schema.errorMessage || localize('enumWarning', 'Value is not accepted. Valid values: {0}.', schema.enum.map(v => JSON.stringify(v)).join(', '))
				});
			}
		}

		if (isDefined(schema.const)) {
			const val = getNodeValue(node);
			if (!equals(val, schema.const)) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					code: ErrorCode.EnumValueMismatch,
					message: schema.errorMessage || localize('constWarning', 'Value must be {0}.', JSON.stringify(schema.const))
				});
				validationResult.enumValueMatch = false;
			} else {
				validationResult.enumValueMatch = true;
			}
			validationResult.enumValues = [schema.const];
		}

		let deprecationMessage = schema.deprecationMessage;
		if ((deprecationMessage || schema.deprecated) && node.parent) {
			deprecationMessage = deprecationMessage || localize('deprecated', 'Value is deprecated');
			validationResult.problems.push({
				location: { offset: node.parent.offset, length: node.parent.length },
				severity: DiagnosticSeverity.Warning,
				message: deprecationMessage,
				code: ErrorCode.Deprecated
			});
		}
	}



	function _validateNumberNode(node: NumberASTNode): void {
		const val = node.value;

		function normalizeFloats(float: number): { value: number, multiplier: number } | null {
			const parts = /^(-?\d+)(?:\.(\d+))?(?:e([-+]\d+))?$/.exec(float.toString());
			return parts && {
				value: Number(parts[1] + (parts[2] || '')),
				multiplier: (parts[2]?.length || 0) - (parseInt(parts[3]) || 0)
			};
		};
		if (isNumber(schema.multipleOf)) {
			let remainder: number = -1;
			if (Number.isInteger(schema.multipleOf)) {
				remainder = val % schema.multipleOf;
			} else {
				let normMultipleOf = normalizeFloats(schema.multipleOf);
				let normValue = normalizeFloats(val);
				if (normMultipleOf && normValue) {
					const multiplier = 10 ** Math.abs(normValue.multiplier - normMultipleOf.multiplier);
					if (normValue.multiplier < normMultipleOf.multiplier) {
						normValue.value *= multiplier;
					} else {
						normMultipleOf.value *= multiplier;
					}
					remainder = normValue.value % normMultipleOf.value;
				}
			}
			if (remainder !== 0) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: localize('multipleOfWarning', 'Value is not divisible by {0}.', schema.multipleOf)
				});
			}
		}
		function getExclusiveLimit(limit: number | undefined, exclusive: boolean | number | undefined): number | undefined {
			if (isNumber(exclusive)) {
				return exclusive;
			}
			if (isBoolean(exclusive) && exclusive) {
				return limit;
			}
			return undefined;
		}
		function getLimit(limit: number | undefined, exclusive: boolean | number | undefined): number | undefined {
			if (!isBoolean(exclusive) || !exclusive) {
				return limit;
			}
			return undefined;
		}
		const exclusiveMinimum = getExclusiveLimit(schema.minimum, schema.exclusiveMinimum);
		if (isNumber(exclusiveMinimum) && val <= exclusiveMinimum) {
			validationResult.problems.push({
				location: { offset: node.offset, length: node.length },
				message: localize('exclusiveMinimumWarning', 'Value is below the exclusive minimum of {0}.', exclusiveMinimum)
			});
		}
		const exclusiveMaximum = getExclusiveLimit(schema.maximum, schema.exclusiveMaximum);
		if (isNumber(exclusiveMaximum) && val >= exclusiveMaximum) {
			validationResult.problems.push({
				location: { offset: node.offset, length: node.length },
				message: localize('exclusiveMaximumWarning', 'Value is above the exclusive maximum of {0}.', exclusiveMaximum)
			});
		}
		const minimum = getLimit(schema.minimum, schema.exclusiveMinimum);
		if (isNumber(minimum) && val < minimum) {
			validationResult.problems.push({
				location: { offset: node.offset, length: node.length },
				message: localize('minimumWarning', 'Value is below the minimum of {0}.', minimum)
			});
		}
		const maximum = getLimit(schema.maximum, schema.exclusiveMaximum);
		if (isNumber(maximum) && val > maximum) {
			validationResult.problems.push({
				location: { offset: node.offset, length: node.length },
				message: localize('maximumWarning', 'Value is above the maximum of {0}.', maximum)
			});
		}
	}

	function _validateStringNode(node: StringASTNode): void {
		if (isNumber(schema.minLength) && node.value.length < schema.minLength) {
			validationResult.problems.push({
				location: { offset: node.offset, length: node.length },
				message: localize('minLengthWarning', 'String is shorter than the minimum length of {0}.', schema.minLength)
			});
		}

		if (isNumber(schema.maxLength) && node.value.length > schema.maxLength) {
			validationResult.problems.push({
				location: { offset: node.offset, length: node.length },
				message: localize('maxLengthWarning', 'String is longer than the maximum length of {0}.', schema.maxLength)
			});
		}

		if (isString(schema.pattern)) {
			const regex = extendedRegExp(schema.pattern);
			if (!(regex?.test(node.value))) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: schema.patternErrorMessage || schema.errorMessage || localize('patternWarning', 'String does not match the pattern of "{0}".', schema.pattern)
				});
			}
		}

		if (schema.format) {
			switch (schema.format) {
				case 'uri':
				case 'uri-reference': {
					let errorMessage;
					if (!node.value) {
						errorMessage = localize('uriEmpty', 'URI expected.');
					} else {
						const match = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/.exec(node.value);
						if (!match) {
							errorMessage = localize('uriMissing', 'URI is expected.');
						} else if (!match[2] && schema.format === 'uri') {
							errorMessage = localize('uriSchemeMissing', 'URI with a scheme is expected.');
						}
					}
					if (errorMessage) {
						validationResult.problems.push({
							location: { offset: node.offset, length: node.length },
							message: schema.patternErrorMessage || schema.errorMessage || localize('uriFormatWarning', 'String is not a URI: {0}', errorMessage)
						});
					}
				}
					break;
				case 'color-hex':
				case 'date-time':
				case 'date':
				case 'time':
				case 'email':
				case 'hostname':
				case 'ipv4':
				case 'ipv6':
					const format = formats[schema.format];
					if (!node.value || !format.pattern.exec(node.value)) {
						validationResult.problems.push({
							location: { offset: node.offset, length: node.length },
							message: schema.patternErrorMessage || schema.errorMessage || format.errorMessage
						});
					}
				default:
			}
		}

	}
	function _validateArrayNode(node: ArrayASTNode): void {
		let prefixItemsSchemas: JSONSchemaRef[] | undefined;
		let additionalItemSchema: JSONSchemaRef | undefined;
		let isSchema_2020_12 = Array.isArray(schema.prefixItems) || (schema.items !== undefined && !Array.isArray(schema.items) && schema.additionalItems === undefined);
		if (isSchema_2020_12) {
			prefixItemsSchemas = schema.prefixItems;
			additionalItemSchema = !Array.isArray(schema.items) ? schema.items : undefined;
		} else {
			prefixItemsSchemas = Array.isArray(schema.items) ? schema.items : undefined;
			additionalItemSchema = !Array.isArray(schema.items) ? schema.items : schema.additionalItems;
		}
		let index = 0;
		if (prefixItemsSchemas !== undefined) {
			const max = Math.min(prefixItemsSchemas.length, node.items.length);
			for (; index < max; index++) {
				const subSchemaRef = prefixItemsSchemas[index];
				const subSchema = asSchema(subSchemaRef);
				const itemValidationResult = new ValidationResult();
				const item = node.items[index];
				if (item) {
					validate(item, subSchema, itemValidationResult, matchingSchemas);
					validationResult.mergePropertyMatch(itemValidationResult);
				}
				validationResult.processedProperties.add(String(index));
			}
		}
		if (additionalItemSchema !== undefined && index < node.items.length) {
			if (typeof additionalItemSchema === 'boolean') {
				if (additionalItemSchema === false) {
					validationResult.problems.push({
						location: { offset: node.offset, length: node.length },
						message: localize('additionalItemsWarning', 'Array has too many items according to schema. Expected {0} or fewer.', index)
					});
				}
				for (; index < node.items.length; index++) {
					validationResult.processedProperties.add(String(index));
					validationResult.propertiesValueMatches++;
				}
			} else {
				for (; index < node.items.length; index++) {
					const itemValidationResult = new ValidationResult();
					validate(node.items[index], additionalItemSchema, itemValidationResult, matchingSchemas);
					validationResult.mergePropertyMatch(itemValidationResult);
					validationResult.processedProperties.add(String(index));
				}
			}
		}

		const containsSchema = asSchema(schema.contains);
		if (containsSchema) {
			let containsCount = 0;
			for (let index = 0; index < node.items.length; index++) {
				const item = node.items[index];
				const itemValidationResult = new ValidationResult();
				validate(item, containsSchema, itemValidationResult, NoOpSchemaCollector.instance);
				if (!itemValidationResult.hasProblems()) {
					containsCount++;
					if (isSchema_2020_12) {
						validationResult.processedProperties.add(String(index));
					}
				}
			}
			if (containsCount === 0 && !isNumber(schema.minContains)) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: schema.errorMessage || localize('requiredItemMissingWarning', 'Array does not contain required item.')
				});
			}
			if (isNumber(schema.minContains) && containsCount < schema.minContains) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: localize('minContainsWarning', 'Array has too few items that match the contains contraint. Expected {0} or more.', schema.minContains)
				});
			}
			if (isNumber(schema.maxContains) && containsCount > schema.maxContains) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: localize('maxContainsWarning', 'Array has too many items that match the contains contraint. Expected {0} or less.', schema.maxContains)
				});
			}
		}

		const unevaluatedItems = schema.unevaluatedItems;
		if (unevaluatedItems !== undefined) {
			for (let i = 0; i < node.items.length; i++) {
				if (!validationResult.processedProperties.has(String(i))) {
					if (unevaluatedItems === false) {
						validationResult.problems.push({
							location: { offset: node.offset, length: node.length },
							message: localize('unevaluatedItemsWarning', 'Item does not match any validation rule from the array.')
						});
					} else {
						const itemValidationResult = new ValidationResult();
						validate(node.items[i], <any>schema.additionalItems, itemValidationResult, matchingSchemas);
						validationResult.mergePropertyMatch(itemValidationResult);
					}
				}
				validationResult.processedProperties.add(String(i));
				validationResult.propertiesValueMatches++;
			}
		}

		if (isNumber(schema.minItems) && node.items.length < schema.minItems) {
			validationResult.problems.push({
				location: { offset: node.offset, length: node.length },
				message: localize('minItemsWarning', 'Array has too few items. Expected {0} or more.', schema.minItems)
			});
		}

		if (isNumber(schema.maxItems) && node.items.length > schema.maxItems) {
			validationResult.problems.push({
				location: { offset: node.offset, length: node.length },
				message: localize('maxItemsWarning', 'Array has too many items. Expected {0} or fewer.', schema.maxItems)
			});
		}

		if (schema.uniqueItems === true) {
			const values = getNodeValue(node);
			const duplicates = values.some((value: any, index: number) => {
				return index !== values.lastIndexOf(value);
			});
			if (duplicates) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: localize('uniqueItemsWarning', 'Array has duplicate items.')
				});
			}
		}

	}

	function _validateObjectNode(node: ObjectASTNode): void {
		const seenKeys: { [key: string]: ASTNode | undefined } = Object.create(null);
		const unprocessedProperties: Set<string> = new Set();
		for (const propertyNode of node.properties) {
			const key = propertyNode.keyNode.value;
			seenKeys[key] = propertyNode.valueNode;
			unprocessedProperties.add(key);
		}

		if (Array.isArray(schema.required)) {
			for (const propertyName of schema.required) {
				if (!seenKeys[propertyName]) {
					const keyNode = node.parent && node.parent.type === 'property' && node.parent.keyNode;
					const location = keyNode ? { offset: keyNode.offset, length: keyNode.length } : { offset: node.offset, length: 1 };
					validationResult.problems.push({
						location: location,
						message: localize('MissingRequiredPropWarning', 'Missing property "{0}".', propertyName)
					});
				}
			}
		}

		const propertyProcessed = (prop: string) => {
			unprocessedProperties.delete(prop);
			validationResult.processedProperties.add(prop);
		};

		if (schema.properties) {
			for (const propertyName of Object.keys(schema.properties)) {
				propertyProcessed(propertyName);
				const propertySchema = schema.properties[propertyName];
				const child = seenKeys[propertyName];
				if (child) {
					if (isBoolean(propertySchema)) {
						if (!propertySchema) {
							const propertyNode = <PropertyASTNode>child.parent;
							validationResult.problems.push({
								location: { offset: propertyNode.keyNode.offset, length: propertyNode.keyNode.length },
								message: schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName)
							});
						} else {
							validationResult.propertiesMatches++;
							validationResult.propertiesValueMatches++;
						}
					} else {
						const propertyValidationResult = new ValidationResult();
						validate(child, propertySchema, propertyValidationResult, matchingSchemas);
						validationResult.mergePropertyMatch(propertyValidationResult);
					}
				}

			}
		}

		if (schema.patternProperties) {
			for (const propertyPattern of Object.keys(schema.patternProperties)) {
				const regex = extendedRegExp(propertyPattern);
				if (regex) {
					const processed = [];
					for (const propertyName of unprocessedProperties) {
						if (regex.test(propertyName)) {
							processed.push(propertyName);
							const child = seenKeys[propertyName];
							if (child) {
								const propertySchema = schema.patternProperties[propertyPattern];
								if (isBoolean(propertySchema)) {
									if (!propertySchema) {
										const propertyNode = <PropertyASTNode>child.parent;
										validationResult.problems.push({
											location: { offset: propertyNode.keyNode.offset, length: propertyNode.keyNode.length },
											message: schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName)
										});
									} else {
										validationResult.propertiesMatches++;
										validationResult.propertiesValueMatches++;
									}
								} else {
									const propertyValidationResult = new ValidationResult();
									validate(child, propertySchema, propertyValidationResult, matchingSchemas);
									validationResult.mergePropertyMatch(propertyValidationResult);
								}
							}
						}
					}
					processed.forEach(propertyProcessed);
				}
			}
		}


		const additionalProperties = schema.additionalProperties;
		if (additionalProperties !== undefined && additionalProperties !== true) {
			for (const propertyName of unprocessedProperties) {
				propertyProcessed(propertyName);
				const child = seenKeys[propertyName];
				if (child) {
					if (additionalProperties === false) {
						const propertyNode = <PropertyASTNode>child.parent;

						validationResult.problems.push({
							location: { offset: propertyNode.keyNode.offset, length: propertyNode.keyNode.length },
							message: schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName)
						});
					} else {
						const propertyValidationResult = new ValidationResult();
						validate(child, additionalProperties, propertyValidationResult, matchingSchemas);
						validationResult.mergePropertyMatch(propertyValidationResult);
					}
				}
			}
		}
		const unevaluatedProperties = schema.unevaluatedProperties;
		if (unevaluatedProperties !== undefined && unevaluatedProperties !== true) {
			const processed = [];
			for (const propertyName of unprocessedProperties) {
				if (!validationResult.processedProperties.has(propertyName)) {
					processed.push(propertyName);
					const child = seenKeys[propertyName];
					if (child) {
						if (unevaluatedProperties === false) {
							const propertyNode = <PropertyASTNode>child.parent;

							validationResult.problems.push({
								location: { offset: propertyNode.keyNode.offset, length: propertyNode.keyNode.length },
								message: schema.errorMessage || localize('DisallowedExtraPropWarning', 'Property {0} is not allowed.', propertyName)
							});
						} else {
							const propertyValidationResult = new ValidationResult();
							validate(child, unevaluatedProperties, propertyValidationResult, matchingSchemas);
							validationResult.mergePropertyMatch(propertyValidationResult);
						}
					}
				}
			}
			processed.forEach(propertyProcessed);
		}

		if (isNumber(schema.maxProperties)) {
			if (node.properties.length > schema.maxProperties) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: localize('MaxPropWarning', 'Object has more properties than limit of {0}.', schema.maxProperties)
				});
			}
		}

		if (isNumber(schema.minProperties)) {
			if (node.properties.length < schema.minProperties) {
				validationResult.problems.push({
					location: { offset: node.offset, length: node.length },
					message: localize('MinPropWarning', 'Object has fewer properties than the required number of {0}', schema.minProperties)
				});
			}
		}

		if (schema.dependentRequired) {
			for (const key in schema.dependentRequired) {
				const prop = seenKeys[key];
				const propertyDeps = schema.dependentRequired[key];
				if (prop && Array.isArray(propertyDeps)) {
					_validatePropertyDependencies(key, propertyDeps);
				}
			}
		}
		if (schema.dependentSchemas) {
			for (const key in schema.dependentSchemas) {
				const prop = seenKeys[key];
				const propertyDeps = schema.dependentSchemas[key];
				if (prop && isObject(propertyDeps)) {
					_validatePropertyDependencies(key, propertyDeps);
				}
			}
		}

		if (schema.dependencies) {
			for (const key in schema.dependencies) {
				const prop = seenKeys[key];
				if (prop) {
					_validatePropertyDependencies(key, schema.dependencies[key]);
				}
			}
		}

		const propertyNames = asSchema(schema.propertyNames);
		if (propertyNames) {
			for (const f of node.properties) {
				const key = f.keyNode;
				if (key) {
					validate(key, propertyNames, validationResult, NoOpSchemaCollector.instance);
				}
			}
		}

		function _validatePropertyDependencies(key: string, propertyDep: string[] | JSONSchemaRef) {
			if (Array.isArray(propertyDep)) {
				for (const requiredProp of propertyDep) {
					if (!seenKeys[requiredProp]) {
						validationResult.problems.push({
							location: { offset: node.offset, length: node.length },
							message: localize('RequiredDependentPropWarning', 'Object is missing property {0} required by property {1}.', requiredProp, key)
						});
					} else {
						validationResult.propertiesValueMatches++;
					}
				}
			} else {
				const propertySchema = asSchema(propertyDep);
				if (propertySchema) {
					const propertyValidationResult = new ValidationResult();
					validate(node, propertySchema, propertyValidationResult, matchingSchemas);
					validationResult.mergePropertyMatch(propertyValidationResult);
				}
			}
		}
	}
}


export function parse(textDocument: TextDocument, config?: JSONDocumentConfig): JSONDocument {

	const problems: Diagnostic[] = [];
	let lastProblemOffset = -1;
	const text = textDocument.getText();
	const scanner = Json.createScanner(text, false);

	const commentRanges: Range[] | undefined = config && config.collectComments ? [] : undefined;

	function _scanNext(): Json.SyntaxKind {
		while (true) {
			const token = scanner.scan();
			_checkScanError();
			switch (token) {
				case Json.SyntaxKind.LineCommentTrivia:
				case Json.SyntaxKind.BlockCommentTrivia:
					if (Array.isArray(commentRanges)) {
						commentRanges.push(Range.create(textDocument.positionAt(scanner.getTokenOffset()), textDocument.positionAt(scanner.getTokenOffset() + scanner.getTokenLength())));
					}
					break;
				case Json.SyntaxKind.Trivia:
				case Json.SyntaxKind.LineBreakTrivia:
					break;
				default:
					return token;
			}
		}
	}

	function _accept(token: Json.SyntaxKind): boolean {
		if (scanner.getToken() === token) {
			_scanNext();
			return true;
		}
		return false;
	}

	function _errorAtRange<T extends ASTNode>(message: string, code: ErrorCode, startOffset: number, endOffset: number, severity: DiagnosticSeverity = DiagnosticSeverity.Error): void {

		if (problems.length === 0 || startOffset !== lastProblemOffset) {
			const range = Range.create(textDocument.positionAt(startOffset), textDocument.positionAt(endOffset));
			problems.push(Diagnostic.create(range, message, severity, code, textDocument.languageId));
			lastProblemOffset = startOffset;
		}
	}

	function _error<T extends ASTNodeImpl>(message: string, code: ErrorCode, node: T | undefined = undefined, skipUntilAfter: Json.SyntaxKind[] = [], skipUntil: Json.SyntaxKind[] = []): T | undefined {
		let start = scanner.getTokenOffset();
		let end = scanner.getTokenOffset() + scanner.getTokenLength();
		if (start === end && start > 0) {
			start--;
			while (start > 0 && /\s/.test(text.charAt(start))) {
				start--;
			}
			end = start + 1;
		}
		_errorAtRange(message, code, start, end);

		if (node) {
			_finalize(node, false);
		}
		if (skipUntilAfter.length + skipUntil.length > 0) {
			let token = scanner.getToken();
			while (token !== Json.SyntaxKind.EOF) {
				if (skipUntilAfter.indexOf(token) !== -1) {
					_scanNext();
					break;
				} else if (skipUntil.indexOf(token) !== -1) {
					break;
				}
				token = _scanNext();
			}
		}
		return node;
	}

	function _checkScanError(): boolean {
		switch (scanner.getTokenError()) {
			case Json.ScanError.InvalidUnicode:
				_error(localize('InvalidUnicode', 'Invalid unicode sequence in string.'), ErrorCode.InvalidUnicode);
				return true;
			case Json.ScanError.InvalidEscapeCharacter:
				_error(localize('InvalidEscapeCharacter', 'Invalid escape character in string.'), ErrorCode.InvalidEscapeCharacter);
				return true;
			case Json.ScanError.UnexpectedEndOfNumber:
				_error(localize('UnexpectedEndOfNumber', 'Unexpected end of number.'), ErrorCode.UnexpectedEndOfNumber);
				return true;
			case Json.ScanError.UnexpectedEndOfComment:
				_error(localize('UnexpectedEndOfComment', 'Unexpected end of comment.'), ErrorCode.UnexpectedEndOfComment);
				return true;
			case Json.ScanError.UnexpectedEndOfString:
				_error(localize('UnexpectedEndOfString', 'Unexpected end of string.'), ErrorCode.UnexpectedEndOfString);
				return true;
			case Json.ScanError.InvalidCharacter:
				_error(localize('InvalidCharacter', 'Invalid characters in string. Control characters must be escaped.'), ErrorCode.InvalidCharacter);
				return true;
		}
		return false;
	}

	function _finalize<T extends ASTNodeImpl>(node: T, scanNext: boolean): T {
		node.length = scanner.getTokenOffset() + scanner.getTokenLength() - node.offset;

		if (scanNext) {
			_scanNext();
		}

		return node;
	}

	function _parseArray(parent: ASTNode | undefined): ArrayASTNode | undefined {
		if (scanner.getToken() !== Json.SyntaxKind.OpenBracketToken) {
			return undefined;
		}
		const node = new ArrayASTNodeImpl(parent, scanner.getTokenOffset());
		_scanNext(); // consume OpenBracketToken

		const count = 0;
		let needsComma = false;
		while (scanner.getToken() !== Json.SyntaxKind.CloseBracketToken && scanner.getToken() !== Json.SyntaxKind.EOF) {
			if (scanner.getToken() === Json.SyntaxKind.CommaToken) {
				if (!needsComma) {
					_error(localize('ValueExpected', 'Value expected'), ErrorCode.ValueExpected);
				}
				const commaOffset = scanner.getTokenOffset();
				_scanNext(); // consume comma
				if (scanner.getToken() === Json.SyntaxKind.CloseBracketToken) {
					if (needsComma) {
						_errorAtRange(localize('TrailingComma', 'Trailing comma'), ErrorCode.TrailingComma, commaOffset, commaOffset + 1);
					}
					continue;
				}
			} else if (needsComma) {
				_error(localize('ExpectedComma', 'Expected comma'), ErrorCode.CommaExpected);
			}
			const item = _parseValue(node);
			if (!item) {
				_error(localize('PropertyExpected', 'Value expected'), ErrorCode.ValueExpected, undefined, [], [Json.SyntaxKind.CloseBracketToken, Json.SyntaxKind.CommaToken]);
			} else {
				node.items.push(item);
			}
			needsComma = true;
		}

		if (scanner.getToken() !== Json.SyntaxKind.CloseBracketToken) {
			return _error(localize('ExpectedCloseBracket', 'Expected comma or closing bracket'), ErrorCode.CommaOrCloseBacketExpected, node);
		}

		return _finalize(node, true);
	}

	const keyPlaceholder = new StringASTNodeImpl(undefined, 0, 0);

	function _parseProperty(parent: ObjectASTNode | undefined, keysSeen: { [key: string]: (PropertyASTNode | boolean) }): PropertyASTNode | undefined {
		const node = new PropertyASTNodeImpl(parent, scanner.getTokenOffset(), keyPlaceholder);
		let key = _parseString(node);
		if (!key) {
			if (scanner.getToken() === Json.SyntaxKind.Unknown) {
				// give a more helpful error message
				_error(localize('DoubleQuotesExpected', 'Property keys must be doublequoted'), ErrorCode.Undefined);
				const keyNode = new StringASTNodeImpl(node, scanner.getTokenOffset(), scanner.getTokenLength());
				keyNode.value = scanner.getTokenValue();
				key = keyNode;
				_scanNext(); // consume Unknown
			} else {
				return undefined;
			}
		}
		node.keyNode = key;

		// For JSON files that forbid code comments, there is a convention to use the key name "//" to add comments.
		// Multiple instances of "//" are okay.
		if (key.value !== "//") {
			const seen = keysSeen[key.value];
			if (seen) {
				_errorAtRange(localize('DuplicateKeyWarning', "Duplicate object key"), ErrorCode.DuplicateKey, node.keyNode.offset, node.keyNode.offset + node.keyNode.length, DiagnosticSeverity.Warning);
				if (isObject(seen)) {
					_errorAtRange(localize('DuplicateKeyWarning', "Duplicate object key"), ErrorCode.DuplicateKey, seen.keyNode.offset, seen.keyNode.offset + seen.keyNode.length, DiagnosticSeverity.Warning);
				}
				keysSeen[key.value] = true; // if the same key is duplicate again, avoid duplicate error reporting
			} else {
				keysSeen[key.value] = node;
			}
		}

		if (scanner.getToken() === Json.SyntaxKind.ColonToken) {
			node.colonOffset = scanner.getTokenOffset();
			_scanNext(); // consume ColonToken
		} else {
			_error(localize('ColonExpected', 'Colon expected'), ErrorCode.ColonExpected);
			if (scanner.getToken() === Json.SyntaxKind.StringLiteral && textDocument.positionAt(key.offset + key.length).line < textDocument.positionAt(scanner.getTokenOffset()).line) {
				node.length = key.length;
				return node;
			}
		}
		const value = _parseValue(node);
		if (!value) {
			return _error(localize('ValueExpected', 'Value expected'), ErrorCode.ValueExpected, node, [], [Json.SyntaxKind.CloseBraceToken, Json.SyntaxKind.CommaToken]);
		}
		node.valueNode = value;
		node.length = value.offset + value.length - node.offset;
		return node;
	}

	function _parseObject(parent: ASTNode | undefined): ObjectASTNode | undefined {
		if (scanner.getToken() !== Json.SyntaxKind.OpenBraceToken) {
			return undefined;
		}
		const node = new ObjectASTNodeImpl(parent, scanner.getTokenOffset());
		const keysSeen: any = Object.create(null);
		_scanNext(); // consume OpenBraceToken
		let needsComma = false;

		while (scanner.getToken() !== Json.SyntaxKind.CloseBraceToken && scanner.getToken() !== Json.SyntaxKind.EOF) {
			if (scanner.getToken() === Json.SyntaxKind.CommaToken) {
				if (!needsComma) {
					_error(localize('PropertyExpected', 'Property expected'), ErrorCode.PropertyExpected);
				}
				const commaOffset = scanner.getTokenOffset();
				_scanNext(); // consume comma
				if (scanner.getToken() === Json.SyntaxKind.CloseBraceToken) {
					if (needsComma) {
						_errorAtRange(localize('TrailingComma', 'Trailing comma'), ErrorCode.TrailingComma, commaOffset, commaOffset + 1);
					}
					continue;
				}
			} else if (needsComma) {
				_error(localize('ExpectedComma', 'Expected comma'), ErrorCode.CommaExpected);
			}
			const property = _parseProperty(node, keysSeen);
			if (!property) {
				_error(localize('PropertyExpected', 'Property expected'), ErrorCode.PropertyExpected, undefined, [], [Json.SyntaxKind.CloseBraceToken, Json.SyntaxKind.CommaToken]);
			} else {
				node.properties.push(property);
			}
			needsComma = true;
		}

		if (scanner.getToken() !== Json.SyntaxKind.CloseBraceToken) {
			return _error(localize('ExpectedCloseBrace', 'Expected comma or closing brace'), ErrorCode.CommaOrCloseBraceExpected, node);
		}
		return _finalize(node, true);
	}

	function _parseString(parent: ASTNode | undefined): StringASTNode | undefined {
		if (scanner.getToken() !== Json.SyntaxKind.StringLiteral) {
			return undefined;
		}

		const node = new StringASTNodeImpl(parent, scanner.getTokenOffset());
		node.value = scanner.getTokenValue();

		return _finalize(node, true);
	}

	function _parseNumber(parent: ASTNode | undefined): NumberASTNode | undefined {
		if (scanner.getToken() !== Json.SyntaxKind.NumericLiteral) {
			return undefined;
		}

		const node = new NumberASTNodeImpl(parent, scanner.getTokenOffset());
		if (scanner.getTokenError() === Json.ScanError.None) {
			const tokenValue = scanner.getTokenValue();
			try {
				const numberValue = JSON.parse(tokenValue);
				if (!isNumber(numberValue)) {
					return _error(localize('InvalidNumberFormat', 'Invalid number format.'), ErrorCode.Undefined, node);
				}
				node.value = numberValue;
			} catch (e) {
				return _error(localize('InvalidNumberFormat', 'Invalid number format.'), ErrorCode.Undefined, node);
			}
			node.isInteger = tokenValue.indexOf('.') === -1;
		}
		return _finalize(node, true);
	}

	function _parseLiteral(parent: ASTNode | undefined): ASTNode | undefined {
		let node: ASTNodeImpl;
		switch (scanner.getToken()) {
			case Json.SyntaxKind.NullKeyword:
				return _finalize(new NullASTNodeImpl(parent, scanner.getTokenOffset()), true);
			case Json.SyntaxKind.TrueKeyword:
				return _finalize(new BooleanASTNodeImpl(parent, true, scanner.getTokenOffset()), true);
			case Json.SyntaxKind.FalseKeyword:
				return _finalize(new BooleanASTNodeImpl(parent, false, scanner.getTokenOffset()), true);
			default:
				return undefined;
		}
	}

	function _parseValue(parent: ASTNode | undefined): ASTNode | undefined {
		return _parseArray(parent) || _parseObject(parent) || _parseString(parent) || _parseNumber(parent) || _parseLiteral(parent);
	}

	let _root: ASTNode | undefined = undefined;
	const token = _scanNext();
	if (token !== Json.SyntaxKind.EOF) {
		_root = _parseValue(_root);
		if (!_root) {
			_error(localize('Invalid symbol', 'Expected a JSON object, array or literal.'), ErrorCode.Undefined);
		} else if (scanner.getToken() !== Json.SyntaxKind.EOF) {
			_error(localize('End of file expected', 'End of file expected.'), ErrorCode.Undefined);
		}
	}
	return new JSONDocument(_root, problems, commentRanges);
}
