/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Json from 'jsonc-parser';
import { JSONSchema, JSONSchemaRef } from '../jsonSchema';
import { URI } from 'vscode-uri';
import * as Strings from '../utils/strings';
import { asSchema, getSchemaDraftFromId, JSONDocument, normalizeId } from '../parser/jsonParser';
import { SchemaRequestService, WorkspaceContextService, PromiseConstructor, MatchingSchema, TextDocument, SchemaConfiguration, SchemaDraft, ErrorCode, Vocabularies } from '../jsonLanguageTypes';

import * as l10n from '@vscode/l10n';
import { createRegex } from '../utils/glob';
import { isString } from '../utils/objects';
import { DiagnosticRelatedInformation, Range } from 'vscode-languageserver-types';

export interface IJSONSchemaService {

	/**
	 * Registers a schema file in the current workspace to be applicable to files that match the pattern
	 */
	registerExternalSchema(config: SchemaConfiguration): ISchemaHandle;

	/**
	 * Clears all cached schema files
	 */
	clearExternalSchemas(): void;

	/**
	 * Registers contributed schemas
	 */
	setSchemaContributions(schemaContributions: ISchemaContributions): void;

	/**
	 * Looks up the appropriate schema for the given URI
	 */
	getSchemaForResource(resource: string, document?: JSONDocument): PromiseLike<ResolvedSchema | undefined>;

	/**
	 * Returns all registered schema ids
	 */
	getRegisteredSchemaIds(filter?: (scheme: string) => boolean): string[];
}

export interface SchemaAssociation {
	pattern: string[];
	uris: string[];
	folderUri?: string;
}

export interface ISchemaContributions {
	schemas?: { [id: string]: JSONSchema };
	schemaAssociations?: SchemaAssociation[];
}

export interface ISchemaHandle {
	/**
	 * The schema id
	 */
	uri: string;

	/**
	 * The schema from the file, with potential $ref references
	 */
	getUnresolvedSchema(): PromiseLike<UnresolvedSchema>;

	/**
	 * The schema from the file, with references resolved
	 */
	getResolvedSchema(): PromiseLike<ResolvedSchema>;
}

const BANG = '!';
const PATH_SEP = '/';

interface IGlobWrapper {
	regexp: RegExp;
	include: boolean;
}

class FilePatternAssociation {

	private readonly globWrappers: IGlobWrapper[];

	constructor(pattern: string[], private readonly folderUri: string | undefined, private readonly uris: string[]) {
		this.globWrappers = [];
		try {
			for (let patternString of pattern) {
				const include = patternString[0] !== BANG;
				if (!include) {
					patternString = patternString.substring(1);
				}
				if (patternString.length > 0) {
					if (patternString[0] === PATH_SEP) {
						patternString = patternString.substring(1);
					}
					this.globWrappers.push({
						regexp: createRegex('**/' + patternString, { extended: true, globstar: true }),
						include: include,
					});
				}
			};
			if (folderUri) {
				folderUri = normalizeResourceForMatching(folderUri);
				if (!folderUri.endsWith('/')) {
					folderUri = folderUri + '/';
				}
				this.folderUri = folderUri;
			}
		} catch (e) {
			this.globWrappers.length = 0;
			this.uris = [];
		}
	}

	public matchesPattern(fileName: string): boolean {
		if (this.folderUri && !fileName.startsWith(this.folderUri)) {
			return false;
		}
		let match = false;
		for (const { regexp, include } of this.globWrappers) {
			if (regexp.test(fileName)) {
				match = include;
			}
		}
		return match;
	}

	public getURIs() {
		return this.uris;
	}
}

type SchemaDependencies = Set<string>;

class SchemaHandle implements ISchemaHandle {

	public readonly uri: string;
	public readonly dependencies: SchemaDependencies;
	public anchors: Map<string, JSONSchema> | undefined;
	private resolvedSchema: PromiseLike<ResolvedSchema> | undefined;
	private unresolvedSchema: PromiseLike<UnresolvedSchema> | undefined;
	private readonly service: JSONSchemaService;

	constructor(service: JSONSchemaService, uri: string, unresolvedSchemaContent?: JSONSchema) {
		this.service = service;
		this.uri = uri;
		this.dependencies = new Set();
		this.anchors = undefined;
		if (unresolvedSchemaContent) {
			this.unresolvedSchema = this.service.promise.resolve(new UnresolvedSchema(unresolvedSchemaContent));
		}
	}

	public getUnresolvedSchema(): PromiseLike<UnresolvedSchema> {
		if (!this.unresolvedSchema) {
			this.unresolvedSchema = this.service.loadSchema(this.uri);
		}
		return this.unresolvedSchema;
	}

	public getResolvedSchema(): PromiseLike<ResolvedSchema> {
		if (!this.resolvedSchema) {
			this.resolvedSchema = this.getUnresolvedSchema().then(unresolved => {
				return this.service.resolveSchemaContent(unresolved, this);
			});
		}
		return this.resolvedSchema;
	}

	public clearSchema(): boolean {
		const hasChanges = !!this.unresolvedSchema;
		this.resolvedSchema = undefined;
		this.unresolvedSchema = undefined;
		this.dependencies.clear();
		this.anchors = undefined;
		return hasChanges;
	}

	public setSchemaContent(schemaContent: JSONSchema): void {
		this.unresolvedSchema = this.service.promise.resolve(new UnresolvedSchema(schemaContent));
		this.resolvedSchema = undefined;
		this.anchors = undefined;
	}
}


export class UnresolvedSchema {
	public readonly schema: JSONSchema;
	public readonly errors: SchemaDiagnostic[];

	constructor(schema: JSONSchema, errors: SchemaDiagnostic[] = []) {
		this.schema = schema;
		this.errors = errors;
	}
}

export type SchemaDiagnostic = { readonly message: string; readonly code: ErrorCode; relatedInformation?: DiagnosticRelatedInformation[] }

function toDiagnostic(message: string, code: ErrorCode, relatedURL?: string): SchemaDiagnostic {
	const relatedInformation: DiagnosticRelatedInformation[] | undefined = relatedURL ? [{
		location: { uri: relatedURL, range: Range.create(0, 0, 0, 0) },
		message
	}] : undefined;
	return { message, code, relatedInformation };
}

export class ResolvedSchema {
	public readonly schema: JSONSchema;
	public readonly errors: SchemaDiagnostic[];
	public readonly warnings: SchemaDiagnostic[];
	public readonly schemaDraft: SchemaDraft | undefined;
	public readonly activeVocabularies: Vocabularies | undefined;

	constructor(schema: JSONSchema, errors: SchemaDiagnostic[] = [], warnings: SchemaDiagnostic[] = [], schemaDraft: SchemaDraft | undefined, activeVocabularies: Vocabularies | undefined) {
		this.schema = schema;
		this.errors = errors;
		this.warnings = warnings;
		this.schemaDraft = schemaDraft;
		this.activeVocabularies = activeVocabularies;
	}

	public getSection(path: string[]): JSONSchema | undefined {
		const schemaRef = this.getSectionRecursive(path, this.schema);
		if (schemaRef) {
			return asSchema(schemaRef);
		}
		return undefined;
	}

	private getSectionRecursive(path: string[], schema: JSONSchemaRef): JSONSchemaRef | undefined {
		if (!schema || typeof schema === 'boolean' || path.length === 0) {
			return schema;
		}
		const next = path.shift()!;

		if (schema.properties && typeof schema.properties[next]) {
			return this.getSectionRecursive(path, schema.properties[next]);
		} else if (schema.patternProperties) {
			for (const pattern of Object.keys(schema.patternProperties)) {
				const regex = Strings.extendedRegExp(pattern);
				if (regex?.test(next)) {
					return this.getSectionRecursive(path, schema.patternProperties[pattern]);
				}
			}
		} else if (typeof schema.additionalProperties === 'object') {
			return this.getSectionRecursive(path, schema.additionalProperties);
		} else if (next.match('[0-9]+')) {
			if (Array.isArray(schema.items)) {
				const index = parseInt(next, 10);
				if (!isNaN(index) && schema.items[index]) {
					return this.getSectionRecursive(path, schema.items[index]);
				}
			} else if (schema.items) {
				return this.getSectionRecursive(path, schema.items);
			}
		}

		return undefined;
	}
}

export class JSONSchemaService implements IJSONSchemaService {

	private contributionSchemas: { [id: string]: SchemaHandle };
	private contributionAssociations: FilePatternAssociation[];

	private schemasById: { [id: string]: SchemaHandle };
	private filePatternAssociations: FilePatternAssociation[];
	private registeredSchemasIds: { [id: string]: boolean };

	private contextService: WorkspaceContextService | undefined;
	private callOnDispose: Function[];
	private requestService: SchemaRequestService | undefined;
	private promiseConstructor: PromiseConstructor;

	private static traverseSchemaProperties(node: JSONSchema, callback: (schema: JSONSchema) => void): void {
		const singleSchemaProps = ['additionalItems', 'additionalProperties', 'not', 'contains',
			'propertyNames', 'if', 'then', 'else', 'unevaluatedItems', 'unevaluatedProperties', 'items'] as const;
		const schemaMapProps = ['definitions', '$defs', 'properties', 'patternProperties',
			'dependencies', 'dependentSchemas'] as const;
		const schemaArrayProps = ['anyOf', 'allOf', 'oneOf', 'prefixItems'] as const;

		const visitValue = (value: JSONSchemaRef | JSONSchemaRef[]): void => {
			if (value) {
				if (Array.isArray(value)) {
					value.forEach(item => visitValue(item));
				} else if (typeof value === 'object') {
					callback(value);
				}
			}
		};

		for (const prop of singleSchemaProps) {
			const propValue = node[prop];
			if (propValue) {
				visitValue(propValue);
			}
		}

		for (const prop of schemaMapProps) {
			const map = node[prop];
			if (map && typeof map === 'object') {
				Object.values(map).forEach(visitValue);
			}
		}

		for (const prop of schemaArrayProps) {
			const propValue = node[prop];
			if (propValue) {
				visitValue(propValue);
			}
		}
	}

	private cachedSchemaForResource: { resource: string; resolvedSchema: PromiseLike<ResolvedSchema | undefined> } | undefined;

	constructor(requestService?: SchemaRequestService, contextService?: WorkspaceContextService, promiseConstructor?: PromiseConstructor) {
		this.contextService = contextService;
		this.requestService = requestService;
		this.promiseConstructor = promiseConstructor || Promise;
		this.callOnDispose = [];

		this.contributionSchemas = {};
		this.contributionAssociations = [];
		this.schemasById = {};
		this.filePatternAssociations = [];
		this.registeredSchemasIds = {};
	}

	public getRegisteredSchemaIds(filter?: (scheme: string) => boolean): string[] {
		return Object.keys(this.registeredSchemasIds).filter(id => {
			const scheme = URI.parse(id).scheme;
			return scheme !== 'schemaservice' && (!filter || filter(scheme));
		});
	}

	public get promise() {
		return this.promiseConstructor;
	}

	public dispose(): void {
		while (this.callOnDispose.length > 0) {
			this.callOnDispose.pop()!();
		}
	}

	public onResourceChange(uri: string): boolean {
		// always clear this local cache when a resource changes
		this.cachedSchemaForResource = undefined;

		let hasChanges = false;
		uri = normalizeId(uri);

		const toWalk = [uri];
		const all: (SchemaHandle | undefined)[] = Object.keys(this.schemasById).map(key => this.schemasById[key]);

		while (toWalk.length) {
			const curr = toWalk.pop()!;
			for (let i = 0; i < all.length; i++) {
				const handle = all[i];
				if (handle && (handle.uri === curr || handle.dependencies.has(curr))) {
					if (handle.uri !== curr) {
						toWalk.push(handle.uri);
					}
					if (handle.clearSchema()) {
						hasChanges = true;
					}
					all[i] = undefined;
				}
			}
		}
		return hasChanges;
	}

	public setSchemaContributions(schemaContributions: ISchemaContributions): void {
		if (schemaContributions.schemas) {
			const schemas = schemaContributions.schemas;
			for (const id in schemas) {
				const normalizedId = normalizeId(id);
				this.contributionSchemas[normalizedId] = this.addSchemaHandle(normalizedId, schemas[id]);
			}
		}
		if (Array.isArray(schemaContributions.schemaAssociations)) {
			const schemaAssociations = schemaContributions.schemaAssociations;
			for (let schemaAssociation of schemaAssociations) {
				const uris = schemaAssociation.uris.map(normalizeId);
				const association = this.addFilePatternAssociation(schemaAssociation.pattern, schemaAssociation.folderUri, uris);
				this.contributionAssociations.push(association);
			}
		}
	}

	private addSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): SchemaHandle {
		const schemaHandle = new SchemaHandle(this, id, unresolvedSchemaContent);
		this.schemasById[id] = schemaHandle;
		return schemaHandle;
	}

	private getOrAddSchemaHandle(id: string, unresolvedSchemaContent?: JSONSchema): SchemaHandle {
		return this.schemasById[id] || this.addSchemaHandle(id, unresolvedSchemaContent);
	}

	private addFilePatternAssociation(pattern: string[], folderUri: string | undefined, uris: string[]): FilePatternAssociation {
		const fpa = new FilePatternAssociation(pattern, folderUri, uris);
		this.filePatternAssociations.push(fpa);
		return fpa;
	}

	public registerExternalSchema(config: SchemaConfiguration): ISchemaHandle {
		const id = normalizeId(config.uri);
		this.registeredSchemasIds[id] = true;
		this.cachedSchemaForResource = undefined;

		if (config.fileMatch && config.fileMatch.length) {
			this.addFilePatternAssociation(config.fileMatch, config.folderUri, [id]);
		}
		return config.schema ? this.addSchemaHandle(id, config.schema) : this.getOrAddSchemaHandle(id);
	}

	public clearExternalSchemas(): void {
		this.schemasById = {};
		this.filePatternAssociations = [];
		this.registeredSchemasIds = {};
		this.cachedSchemaForResource = undefined;

		for (const id in this.contributionSchemas) {
			this.schemasById[id] = this.contributionSchemas[id];
			this.registeredSchemasIds[id] = true;
		}
		for (const contributionAssociation of this.contributionAssociations) {
			this.filePatternAssociations.push(contributionAssociation);
		}
	}

	public getResolvedSchema(schemaId: string): PromiseLike<ResolvedSchema | undefined> {
		const id = normalizeId(schemaId);
		const schemaHandle = this.schemasById[id];
		if (schemaHandle) {
			return schemaHandle.getResolvedSchema();
		}
		return this.promise.resolve(undefined);
	}

	public loadSchema(url: string): PromiseLike<UnresolvedSchema> {
		if (!this.requestService) {
			const errorMessage = l10n.t('Unable to load schema from \'{0}\'. No schema request service available', toDisplayString(url));
			return this.promise.resolve(new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, ErrorCode.SchemaResolveError, url)]));
		}
		return this.requestService(url).then(
			content => {
				if (!content) {
					const errorMessage = l10n.t('Unable to load schema from \'{0}\': No content.', toDisplayString(url));
					return new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, ErrorCode.SchemaResolveError, url)]);
				}
				const errors = [];
				if (content.charCodeAt(0) === 65279) {
					errors.push(toDiagnostic(l10n.t('Problem reading content from \'{0}\': UTF-8 with BOM detected, only UTF 8 is allowed.', toDisplayString(url)), ErrorCode.SchemaResolveError, url));
					content = content.trimStart();
				}

				let schemaContent: JSONSchema = {};
				const jsonErrors: Json.ParseError[] = [];
				schemaContent = Json.parse(content, jsonErrors);
				if (jsonErrors.length) {
					errors.push(toDiagnostic(l10n.t('Unable to parse content from \'{0}\': Parse error at offset {1}.', toDisplayString(url), jsonErrors[0].offset), ErrorCode.SchemaResolveError, url));
				}
				return new UnresolvedSchema(schemaContent, errors);
			},
			(error: any) => {
				let { message, code } = error;
				if (typeof message !== 'string') {
					let errorMessage = error.toString() as string;
					const errorSplit = error.toString().split('Error: ');
					if (errorSplit.length > 1) {
						// more concise error message, URL and context are attached by caller anyways
						errorMessage = errorSplit[1];
					}
					if (Strings.endsWith(errorMessage, '.')) {
						errorMessage = errorMessage.substr(0, errorMessage.length - 1);
					}
					message = errorMessage;
				}
				let errorCode = ErrorCode.SchemaResolveError;
				if (typeof code === 'number' && code < 0x10000) {
					errorCode += code;
				}
				const errorMessage = l10n.t('Unable to load schema from \'{0}\': {1}.', toDisplayString(url), message);
				return new UnresolvedSchema(<JSONSchema>{}, [toDiagnostic(errorMessage, errorCode, url)]);
			}
		);
	}

	public resolveSchemaContent(schemaToResolve: UnresolvedSchema, handle: SchemaHandle): PromiseLike<ResolvedSchema> {

		const resolveErrors: SchemaDiagnostic[] = schemaToResolve.errors.slice(0);
		const schema = schemaToResolve.schema;

		const schemaDraft = schema.$schema ? getSchemaDraftFromId(schema.$schema) : undefined;
		if (schemaDraft === SchemaDraft.v3) {
			return this.promise.resolve(new ResolvedSchema({}, [toDiagnostic(l10n.t("Draft-03 schemas are not supported."), ErrorCode.SchemaUnsupportedFeature)], [], schemaDraft, undefined));
		}

		let usesUnsupportedFeatures = new Set();
		let activeVocabularies: Vocabularies | undefined = undefined;

		const extractVocabularies = (metaschema: JSONSchema): Vocabularies | undefined => {
			if (!metaschema.$vocabulary || typeof metaschema.$vocabulary !== 'object') {
				return undefined;
			}
			// Both true and false values indicate the vocabulary is active.
			// The boolean indicates whether the vocabulary is required (true) or optional (false),
			// not whether it's in use. All listed vocabularies should be included.
			const vocabs = new Map<string, boolean>();
			for (const [uri, required] of Object.entries(metaschema.$vocabulary)) {
				vocabs.set(uri, required);
			}
			return vocabs.size > 0 ? vocabs : undefined;
		};

		const contextService = this.contextService;

		const findSectionByJSONPointer = (schema: JSONSchema, path: string): any => {
			path = decodeURIComponent(path);
			let current: any = schema;
			if (path[0] === '/') {
				path = path.substring(1);
			}
			path.split('/').some((part) => {
				part = part.replace(/~1/g, '/').replace(/~0/g, '~');
				current = current[part];
				return !current;
			});
			return current;
		};

		// Like findSectionByJSONPointer, but also tracks the effective base URI
		// through any $id encountered along the path. This is needed so that
		// $ref values merged from the found section can be resolved against the
		// correct base, not the document root.
		const findSectionAndBase = (schema: JSONSchema, path: string, baseHandle: SchemaHandle): { section: any; baseHandle: SchemaHandle } => {
			path = decodeURIComponent(path);
			let current: any = schema;
			let currentBaseHandle = baseHandle;
			if (path[0] === '/') {
				path = path.substring(1);
			}
			path.split('/').some((part) => {
				part = part.replace(/~1/g, '/').replace(/~0/g, '~');
				current = current[part];
				if (!current) {
					return true;
				}
				const id = getSchemaId(current);
				if (isString(id) && id.charAt(0) !== '#') {
					let resolvedUri = id;
					if (contextService && !/^[A-Za-z][A-Za-z0-9+\-.+]*:\/.*/.test(id)) {
						resolvedUri = contextService.resolveRelativePath(id, currentBaseHandle.uri);
					}
					resolvedUri = normalizeId(resolvedUri);
					currentBaseHandle = this.getOrAddSchemaHandle(resolvedUri);
				}
				return false;
			});
			return { section: current, baseHandle: currentBaseHandle };
		};

		const findSchemaById = (schema: JSONSchema, handle: SchemaHandle, id: string) => {
			if (!handle.anchors) {
				handle.anchors = collectAnchors(schema);
			}
			return handle.anchors.get(id);
		};

		const getSchemaId = (schema: JSONSchema): string | undefined => schema.$id || schema.id;

		const merge = (target: JSONSchema, section: any): void => {
			for (const key in section) {
				if (!section.hasOwnProperty(key) || key === 'id' || key === '$id') {
					continue;
				}

				// Deep merge for properties and patternProperties to combine them
				const shouldDeepMerge = (key === 'properties' || key === 'patternProperties') &&
					typeof section[key] === 'object' && section[key] !== null &&
					typeof (<any>target)[key] === 'object' && (<any>target)[key] !== null;

				(<any>target)[key] = shouldDeepMerge
					? { ...(<any>target)[key], ...section[key] }
					: section[key];
			}

			// Preserve $id as a non-enumerable hidden property for $recursiveRef resolution.
			// This allows $recursiveRef to correctly resolve references within the schema without exposing $id publicly.
			const id = section.$id || section.id;
			if (id) {
				Object.defineProperty(target, '_originalId', {
					value: id,
					enumerable: false,
					writable: true,
					configurable: true
				});
			}
		};

		// Check if schemas need scope isolation for unevaluated keywords
		const needsScopeIsolation = (section: JSONSchema, target: JSONSchema): boolean => {
			const hasUnevaluated = section.unevaluatedProperties !== undefined || section.unevaluatedItems !== undefined;
			const hasSiblingEvaluation = target.properties !== undefined || target.patternProperties !== undefined ||
				target.additionalProperties !== undefined || target.allOf !== undefined || target.anyOf !== undefined ||
				target.oneOf !== undefined || target.if !== undefined;
			return hasUnevaluated && hasSiblingEvaluation;
		};

		const mergeRef = (target: JSONSchema, sourceRoot: JSONSchema, sourceHandle: SchemaHandle, refSegment: string | undefined): void => {
			let section;
			let sectionBaseHandle = sourceHandle;
			if (refSegment === undefined || refSegment.length === 0) {
				section = sourceRoot;
			} else if (refSegment.charAt(0) === '/') {
				// A $ref to a JSON Pointer (i.e #/definitions/foo)
				// Track $id base changes along the path so inner $refs resolve correctly.
				({ section, baseHandle: sectionBaseHandle } = findSectionAndBase(sourceRoot, refSegment, sourceHandle));
			} else {
				// A $ref to a sub-schema with an $id (i.e #hello)
				section = findSchemaById(sourceRoot, sourceHandle, refSegment);
			}
			if (section) {
				// If the found section contains a $ref that needs to be resolved
				// relative to a different base (e.g. it's inside a schema with $id),
				// pre-resolve it now so it carries the correct base URI context.
				if (section.$ref && sectionBaseHandle !== sourceHandle) {
					const innerRef = section.$ref;
					const innerSegments = innerRef.split('#', 2);
					if (innerSegments[0].length > 0 && contextService && !/^[A-Za-z][A-Za-z0-9+\-.+]*:\/.*/.test(innerSegments[0])) {
						section.$ref = contextService.resolveRelativePath(innerSegments[0], sectionBaseHandle.uri) +
							(innerSegments[1] !== undefined ? '#' + innerSegments[1] : '');
					}
				}
				const reservedKeys = new Set(['$ref', '$defs', 'definitions', '$schema', '$id', 'id']);

				// In JSON Schema draft-04 through draft-07, $ref completely overrides any sibling keywords.
				// Starting in 2019-09, sibling keywords are processed alongside $ref.
				// Only strip siblings when schema explicitly declares a pre-2019-09 draft via $schema.
				const isPreDraft201909 = schemaDraft !== undefined && schemaDraft < SchemaDraft.v2019_09;
				if (isPreDraft201909) {
					// Clear all sibling keywords from target - $ref takes precedence
					for (const key in target) {
						if (target.hasOwnProperty(key) && !reservedKeys.has(key)) {
							delete (target as any)[key];
						}
					}
					merge(target, section);
				} else if (needsScopeIsolation(section, target)) {
					// In JSON Schema 2019-09 or greater, $ref creates a new scope when it has sibling keywords.
					// When the $ref'd schema has unevaluatedProperties/unevaluatedItems, it should not
					// see properties/items evaluated by sibling keywords.
					// To achieve this, we wrap the $ref in an allOf when needed.
					const siblingSchema: JSONSchema = {};
					const refSchema = { ...section };

					// Move all existing properties from target to siblingSchema
					for (const key in target) {
						if (target.hasOwnProperty(key) && !reservedKeys.has(key)) {
							const k = key as keyof JSONSchema;
							siblingSchema[k] = target[k] as any;
							delete target[k];
						}
					}

					// Create allOf with the $ref'd schema and sibling schema
					target.allOf = [refSchema, siblingSchema];
				} else {
					merge(target, section);
				}
			} else {
				const message = l10n.t('$ref \'{0}\' in \'{1}\' can not be resolved.', refSegment || '', sourceHandle.uri)
				resolveErrors.push(toDiagnostic(message, ErrorCode.SchemaResolveError));
			}
		};

		const resolveExternalLink = (node: JSONSchema, uri: string, refSegment: string | undefined, parentHandle: SchemaHandle): PromiseLike<any> => {
			if (contextService && !/^[A-Za-z][A-Za-z0-9+\-.+]*:\/.*/.test(uri)) {
				uri = contextService.resolveRelativePath(uri, parentHandle.uri);
			}
			uri = normalizeId(uri);
			const referencedHandle = this.getOrAddSchemaHandle(uri);
			return referencedHandle.getUnresolvedSchema().then(unresolvedSchema => {
				parentHandle.dependencies.add(uri);
				if (unresolvedSchema.errors.length) {
					const error = unresolvedSchema.errors[0];
					const loc = refSegment ? uri + '#' + refSegment : uri;
					const errorMessage = refSegment ? l10n.t('Problems loading reference \'{0}\': {1}', refSegment, error.message) : error.message;
					resolveErrors.push(toDiagnostic(errorMessage, error.code, uri));
				}
				mergeRef(node, unresolvedSchema.schema, referencedHandle, refSegment);
				return resolveRefs(node, unresolvedSchema.schema, referencedHandle);
			});
		};

		const resolveRefs = (node: JSONSchema, parentSchema: JSONSchema, parentHandle: SchemaHandle): PromiseLike<any> => {
			const openPromises: PromiseLike<any>[] = [];

			// Traversal that tracks the current base schema for internal refs.
			// When we encounter a schema with its own $id, that becomes the new base
			// for resolving fragment refs (#...) in its descendants
			const traverseWithBaseTracking = (schema: JSONSchema, currentBase: JSONSchema, currentBaseHandle: SchemaHandle, isRoot: boolean, seen: Set<JSONSchema>) => {
				if (!schema || typeof schema !== 'object' || seen.has(schema)) {
					return;
				}
				seen.add(schema);

				// Check if this schema has its own $id that creates a new base scope
				// This needs to be determined before processing refs
				const id = getSchemaId(schema);
				let newBase = currentBase;
				let newBaseHandle = currentBaseHandle;
				if (!isRoot && isString(id) && id.charAt(0) !== '#') {
					// This is an embedded schema with its own URI - it becomes the new base
					newBase = schema;
					// Get or create a handle for this embedded schema
					let resolvedUri = id;
					if (contextService && !/^[A-Za-z][A-Za-z0-9+\-.+]*:\/.*/.test(id)) {
						resolvedUri = contextService.resolveRelativePath(id, currentBaseHandle.uri);
					}
					resolvedUri = normalizeId(resolvedUri);
					newBaseHandle = this.getOrAddSchemaHandle(resolvedUri);
					// Ensure the handle has this schema registered
					if (!this.schemasById[resolvedUri]) {
						this.addSchemaHandle(resolvedUri, schema);
					}
				}

				// Process refs in this schema
				const seenRefs = new Set<string>();
				while (schema.$ref) {
					const ref = schema.$ref;
					const segments = ref.split('#', 2);
					delete schema.$ref;
					if (segments[0].length > 0) {
						// This is a reference to an external schema (like "foo.json" or "foo.json#/bar")
						// Per JSON Schema spec, $ref is resolved against the current base URI.
						// If this schema has its own $id (sibling case), the $ref should resolve
						// against the parent's base, not the sibling $id. Otherwise, use the
						// nearest ancestor's base (newBaseHandle).
						const refBase = (newBase === schema) ? currentBaseHandle : newBaseHandle;
						openPromises.push(resolveExternalLink(schema, segments[0], segments[1], refBase));
						return;
					} else {
						// This is an internal reference (like "#/definitions/foo")
						// Internal refs are resolved within the current document
						// If this schema has its own $id, it is a new document, so use newBase
						// Otherwise, use the parent's base (currentBase)
						if (!seenRefs.has(ref)) {
							const refId = segments[1];
							mergeRef(schema, newBase, newBaseHandle, refId);
							seenRefs.add(ref);
						}
					}
				}

				if (schema.$dynamicRef) {
					usesUnsupportedFeatures.add('$dynamicRef');
				}
				if (schema.$dynamicAnchor) {
					usesUnsupportedFeatures.add('$dynamicAnchor');
				}

				// Continue traversing child schemas with the potentially updated base
				JSONSchemaService.traverseSchemaProperties(schema, (childSchema) => {
					traverseWithBaseTracking(childSchema, newBase, newBaseHandle, false, seen);
				});
			};

			traverseWithBaseTracking(node, parentSchema, parentHandle, true, new Set<JSONSchema>());

			return this.promise.all(openPromises);
		};

		const collectAnchors = (root: JSONSchema): Map<string, JSONSchema> => {
			const result = new Map<string, JSONSchema>();
			// Traversal that stops at sub-schemas with their own $id
			// because those create a new URI scope for anchors
			const traverseForAnchors = (node: JSONSchema, isRoot: boolean): void => {
				if (!node || typeof node !== 'object') {
					return;
				}
				// If this node has its own $id, and it's not the root, it's a new URI scope
				const id = getSchemaId(node);
				if (!isRoot && isString(id) && id.charAt(0) !== '#') {
					return;
				}

				// Collect anchor from this node
				// In draft-04/06/07, anchors are defined via $id/#fragment (e.g., "$id": "#myanchor")
				// In 2019-09+, $id fragments are no longer anchors; $anchor is used instead
				const fragmentAnchor = (schemaDraft === undefined || schemaDraft < SchemaDraft.v2019_09) && isString(id) && id.charAt(0) === '#' ? id.substring(1) : undefined;
				const dollarAnchor = (schemaDraft === undefined || schemaDraft >= SchemaDraft.v2019_09) ? node.$anchor : undefined;
				const anchor = fragmentAnchor ?? dollarAnchor;
				if (anchor) {
					if (result.has(anchor)) {
						resolveErrors.push(toDiagnostic(l10n.t('Duplicate anchor declaration: \'{0}\'', anchor), ErrorCode.SchemaResolveError));
					} else {
						result.set(anchor, node);
					}
				}

				// Continue traversing child schemas
				JSONSchemaService.traverseSchemaProperties(node, (childSchema) => {
					traverseForAnchors(childSchema, false);
				});
			};

			traverseForAnchors(root, true);

			return result;
		};

		// Collect and register embedded schemas with $id so they can be resolved as external refs
		// This traversal tracks the current base URI so nested $id values are resolved correctly
		const registerEmbeddedSchemas = (root: JSONSchema, baseUri: string): void => {
			const seen = new Set<JSONSchema>();

			const resolveId = (id: string, currentBaseUri: string): string => {
				if (contextService && !/^[A-Za-z][A-Za-z0-9+\-.+]*:\/.*/.test(id)) {
					return normalizeId(contextService.resolveRelativePath(id, currentBaseUri));
				}
				return normalizeId(id);
			};

			const visit = (node: JSONSchema, currentBaseUri: string): void => {
				if (!node || typeof node !== 'object' || seen.has(node)) {
					return;
				}
				seen.add(node);

				// Check if this node has its own $id that changes the base URI
				const id = getSchemaId(node);
				let newBaseUri = currentBaseUri;
				if (isString(id) && id.charAt(0) !== '#') {
					const resolvedUri = resolveId(id, currentBaseUri);
					const existingHandle = this.schemasById[resolvedUri];
					if (!existingHandle) {
						this.addSchemaHandle(resolvedUri, node);
					} else {
						// Update existing handle with embedded schema content
						// This ensures embedded schemas take precedence over external schemas
						existingHandle.setSchemaContent(node);
					}
					newBaseUri = resolvedUri;
				}

				// Visit child schemas
				JSONSchemaService.traverseSchemaProperties(node, (childSchema) => {
					visit(childSchema, newBaseUri);
				});
			};

			visit(root, baseUri);
		};

		// Register embedded schemas before resolving refs
		registerEmbeddedSchemas(schema, handle.uri);

		// Resolve meta-schema to extract vocabularies if present
		const resolveMetaschemaVocabularies = (): PromiseLike<void> => {
			if (!schema.$schema || typeof schema.$schema !== 'string') {
				return this.promise.resolve(undefined);
			}

			const metaschemaUri = schema.$schema;
			const normalizedMetaschemaUri = normalizeId(metaschemaUri);
			const metaschemaHandle = this.getOrAddSchemaHandle(normalizedMetaschemaUri);

			return metaschemaHandle.getUnresolvedSchema().then(unresolvedMetaschema => {
				// Only extract vocabularies if the meta-schema has a $vocabulary property
				// or if it's draft 2019-09 or later which support vocabularies.
				const metaschemaDraft = unresolvedMetaschema.schema.$schema ? getSchemaDraftFromId(unresolvedMetaschema.schema.$schema) : undefined;
				const isDraft2019OrLater = metaschemaDraft && metaschemaDraft >= SchemaDraft.v2019_09;
				const hasVocabulary = unresolvedMetaschema.schema.$vocabulary && typeof unresolvedMetaschema.schema.$vocabulary === 'object';

				if (hasVocabulary || isDraft2019OrLater) {
					activeVocabularies = extractVocabularies(unresolvedMetaschema.schema);
				}
				return undefined;
			}, () => {
				// If we can't load the meta-schema, proceed without vocabulary info
				return undefined;
			});
		};

		return resolveMetaschemaVocabularies().then(() => {
			return resolveRefs(schema, schema, handle).then(_ => {
				let resolveWarnings: SchemaDiagnostic[] = [];
				if (usesUnsupportedFeatures.size) {
					resolveWarnings.push(toDiagnostic(l10n.t('The schema uses meta-schema features ({0}) that are not yet supported by the validator.', Array.from(usesUnsupportedFeatures.keys()).join(', ')), ErrorCode.SchemaUnsupportedFeature));
				}
				return new ResolvedSchema(schema, resolveErrors, resolveWarnings, schemaDraft, activeVocabularies);
			});
		});
	};

	private getSchemaFromProperty(resource: string, document: JSONDocument): string | undefined {
		if (document.root?.type === 'object') {
			for (const p of document.root.properties) {
				if (p.keyNode.value === '$schema' && p.valueNode?.type === 'string') {
					let schemaId = p.valueNode.value;
					if (this.contextService && !/^\w[\w\d+.-]*:/.test(schemaId)) { // has scheme
						schemaId = this.contextService.resolveRelativePath(schemaId, resource);
					}
					return schemaId;
				}
			}
		}
		return undefined;
	}

	private getAssociatedSchemas(resource: string): string[] {
		const seen: { [schemaId: string]: boolean } = Object.create(null);
		const schemas: string[] = [];
		const normalizedResource = normalizeResourceForMatching(resource);
		for (const entry of this.filePatternAssociations) {
			if (entry.matchesPattern(normalizedResource)) {
				for (const schemaId of entry.getURIs()) {
					if (!seen[schemaId]) {
						schemas.push(schemaId);
						seen[schemaId] = true;
					}
				}
			}
		}
		return schemas;
	}

	public getSchemaURIsForResource(resource: string, document?: JSONDocument): string[] {
		let schemeId = document && this.getSchemaFromProperty(resource, document);
		if (schemeId) {
			return [schemeId];
		}
		return this.getAssociatedSchemas(resource);
	}

	public getSchemaForResource(resource: string, document?: JSONDocument): PromiseLike<ResolvedSchema | undefined> {
		if (document) {
			// first use $schema if present
			let schemeId = this.getSchemaFromProperty(resource, document);
			if (schemeId) {
				const id = normalizeId(schemeId);
				return this.getOrAddSchemaHandle(id).getResolvedSchema();
			}
		}
		if (this.cachedSchemaForResource && this.cachedSchemaForResource.resource === resource) {
			return this.cachedSchemaForResource.resolvedSchema;
		}
		const schemas = this.getAssociatedSchemas(resource);
		const resolvedSchema = schemas.length > 0 ? this.createCombinedSchema(resource, schemas).getResolvedSchema() : this.promise.resolve(undefined);
		this.cachedSchemaForResource = { resource, resolvedSchema };
		return resolvedSchema;
	}

	private createCombinedSchema(resource: string, schemaIds: string[]): ISchemaHandle {
		if (schemaIds.length === 1) {
			return this.getOrAddSchemaHandle(schemaIds[0]);
		} else {
			const combinedSchemaId = 'schemaservice://combinedSchema/' + encodeURIComponent(resource);
			const combinedSchema: JSONSchema = {
				allOf: schemaIds.map(schemaId => ({ $ref: schemaId }))
			};
			return this.addSchemaHandle(combinedSchemaId, combinedSchema);
		}
	}

	public getMatchingSchemas(document: TextDocument, jsonDocument: JSONDocument, schema?: JSONSchema): PromiseLike<MatchingSchema[]> {
		if (schema) {
			const id = schema.id || ('schemaservice://untitled/matchingSchemas/' + idCounter++);
			const handle = this.addSchemaHandle(id, schema);
			return handle.getResolvedSchema().then(resolvedSchema => {
				return jsonDocument.getMatchingSchemas(resolvedSchema.schema).filter(s => !s.inverted);
			});
		}
		return this.getSchemaForResource(document.uri, jsonDocument).then(schema => {
			if (schema) {
				return jsonDocument.getMatchingSchemas(schema.schema).filter(s => !s.inverted);
			}
			return [];
		});
	}

}

let idCounter = 0;

function normalizeResourceForMatching(resource: string): string {
	// remove queries and fragments, normalize drive capitalization
	try {
		return URI.parse(resource).with({ fragment: null, query: null }).toString(true);
	} catch (e) {
		return resource;
	}
}

function toDisplayString(url: string) {
	try {
		const uri = URI.parse(url);
		if (uri.scheme === 'file') {
			return uri.fsPath;
		}
	} catch (e) {
		// ignore
	}
	return url;
}
