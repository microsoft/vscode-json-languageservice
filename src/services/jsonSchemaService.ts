/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Json from 'jsonc-parser';
import { JSONSchema, JSONSchemaMap, JSONSchemaRef } from '../jsonSchema';
import { URI } from 'vscode-uri';
import * as Strings from '../utils/strings';
import * as Parser from '../parser/jsonParser';
import { SchemaRequestService, WorkspaceContextService, PromiseConstructor, Thenable, MatchingSchema, TextDocument } from '../jsonLanguageTypes';

import * as nls from 'vscode-nls';
import { createRegex } from '../utils/glob';

const localize = nls.loadMessageBundle();

export interface IJSONSchemaService {

	/**
	 * Registers a schema file in the current workspace to be applicable to files that match the pattern
	 */
	registerExternalSchema(uri: string, filePatterns?: string[], unresolvedSchema?: JSONSchema): ISchemaHandle;

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
	getSchemaForResource(resource: string, document?: Parser.JSONDocument): Thenable<ResolvedSchema | undefined>;

	/**
	 * Returns all registered schema ids
	 */
	getRegisteredSchemaIds(filter?: (scheme: string) => boolean): string[];
}

export interface SchemaAssociation {
	pattern: string[];
	uris: string[];
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
	getUnresolvedSchema(): Thenable<UnresolvedSchema>;

	/**
	 * The schema from the file, with references resolved
	 */
	getResolvedSchema(): Thenable<ResolvedSchema>;
}

const BANG = '!';
const PATH_SEP = '/';

interface IGlobWrapper {
	regexp: RegExp;
	include: boolean;
}

class FilePatternAssociation {

	private readonly uris: string[];
	private readonly globWrappers: IGlobWrapper[];

	constructor(pattern: string[], uris: string[]) {
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
			this.uris = uris;
		} catch (e) {
			this.globWrappers.length = 0;
			this.uris = [];
		}
	}

	public matchesPattern(fileName: string): boolean {
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
	private resolvedSchema: Thenable<ResolvedSchema> | undefined;
	private unresolvedSchema: Thenable<UnresolvedSchema> | undefined;
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

	public getUnresolvedSchema(): Thenable<UnresolvedSchema> {
		if (!this.unresolvedSchema) {
			this.unresolvedSchema = this.service.loadSchema(this.uri);
		}
		return this.unresolvedSchema;
	}

	public getResolvedSchema(): Thenable<ResolvedSchema> {
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
}


export class UnresolvedSchema {
	public schema: JSONSchema;
	public errors: string[];

	constructor(schema: JSONSchema, errors: string[] = []) {
		this.schema = schema;
		this.errors = errors;
	}
}

export class ResolvedSchema {
	public schema: JSONSchema;
	public errors: string[];

	constructor(schema: JSONSchema, errors: string[] = []) {
		this.schema = schema;
		this.errors = errors;
	}

	public getSection(path: string[]): JSONSchema | undefined {
		const schemaRef = this.getSectionRecursive(path, this.schema);
		if (schemaRef) {
			return Parser.asSchema(schemaRef);
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

	private cachedSchemaForResource: { resource: string; resolvedSchema: Thenable<ResolvedSchema | undefined> } | undefined;

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
				const association = this.addFilePatternAssociation(schemaAssociation.pattern, uris);
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

	private addFilePatternAssociation(pattern: string[], uris: string[]): FilePatternAssociation {
		const fpa = new FilePatternAssociation(pattern, uris);
		this.filePatternAssociations.push(fpa);
		return fpa;
	}

	public registerExternalSchema(uri: string, filePatterns?: string[], unresolvedSchemaContent?: JSONSchema): ISchemaHandle {
		const id = normalizeId(uri);
		this.registeredSchemasIds[id] = true;
		this.cachedSchemaForResource = undefined;

		if (filePatterns) {
			this.addFilePatternAssociation(filePatterns, [id]);
		}
		return unresolvedSchemaContent ? this.addSchemaHandle(id, unresolvedSchemaContent) : this.getOrAddSchemaHandle(id);
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

	public getResolvedSchema(schemaId: string): Thenable<ResolvedSchema | undefined> {
		const id = normalizeId(schemaId);
		const schemaHandle = this.schemasById[id];
		if (schemaHandle) {
			return schemaHandle.getResolvedSchema();
		}
		return this.promise.resolve(undefined);
	}

	public loadSchema(url: string): Thenable<UnresolvedSchema> {
		if (!this.requestService) {
			const errorMessage = localize('json.schema.norequestservice', 'Unable to load schema from \'{0}\'. No schema request service available', toDisplayString(url));
			return this.promise.resolve(new UnresolvedSchema(<JSONSchema>{}, [errorMessage]));
		}
		return this.requestService(url).then(
			content => {
				if (!content) {
					const errorMessage = localize('json.schema.nocontent', 'Unable to load schema from \'{0}\': No content.', toDisplayString(url));
					return new UnresolvedSchema(<JSONSchema>{}, [errorMessage]);
				}

				let schemaContent: JSONSchema = {};
				const jsonErrors: Json.ParseError[] = [];
				schemaContent = Json.parse(content, jsonErrors);
				const errors = jsonErrors.length ? [localize('json.schema.invalidFormat', 'Unable to parse content from \'{0}\': Parse error at offset {1}.', toDisplayString(url), jsonErrors[0].offset)] : [];
				return new UnresolvedSchema(schemaContent, errors);
			},
			(error: any) => {
				let errorMessage = error.toString() as string;
				const errorSplit = error.toString().split('Error: ');
				if (errorSplit.length > 1) {
					// more concise error message, URL and context are attached by caller anyways
					errorMessage = errorSplit[1];
				}
				if (Strings.endsWith(errorMessage, '.')) {
					errorMessage = errorMessage.substr(0, errorMessage.length - 1);
				}
				return new UnresolvedSchema(<JSONSchema>{}, [localize('json.schema.nocontent', 'Unable to load schema from \'{0}\': {1}.', toDisplayString(url), errorMessage)]);
			}
		);
	}

	public resolveSchemaContent(schemaToResolve: UnresolvedSchema, handle: SchemaHandle): Thenable<ResolvedSchema> {

		const resolveErrors: string[] = schemaToResolve.errors.slice(0);
		const schema = schemaToResolve.schema;

		if (schema.$schema) {
			const id = normalizeId(schema.$schema);
			if (id === 'http://json-schema.org/draft-03/schema') {
				return this.promise.resolve(new ResolvedSchema({}, [localize('json.schema.draft03.notsupported', "Draft-03 schemas are not supported.")]));
			} else if (id === 'https://json-schema.org/draft/2019-09/schema') {
				resolveErrors.push(localize('json.schema.draft201909.notsupported', "Draft 2019-09 schemas are not yet fully supported."));
			} else if (id === 'https://json-schema.org/draft/2020-12/schema') {
				resolveErrors.push(localize('json.schema.draft202012.notsupported', "Draft 2020-12 schemas are not yet fully supported."));
			}
		}

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

		const findSchemaById = (schema: JSONSchema, handle: SchemaHandle, id: string) => {
			if (!handle.anchors) {
				handle.anchors = collectAnchors(schema);
			}
			return handle.anchors.get(id);
		};

		const merge = (target: JSONSchema, section: any): void => {
			for (const key in section) {
				if (section.hasOwnProperty(key) && !target.hasOwnProperty(key) && key !== 'id' && key !== '$id') {
					(<any>target)[key] = section[key];
				}
			}
		};

		const mergeRef = (target: JSONSchema, sourceRoot: JSONSchema, sourceHandle: SchemaHandle, refSegment: string | undefined): void => {
			let section;
			if (refSegment === undefined || refSegment.length === 0) {
				section = sourceRoot;
			} else if (refSegment.charAt(0) === '/') {
				// A $ref to a JSON Pointer (i.e #/definitions/foo)
				section = findSectionByJSONPointer(sourceRoot, refSegment);
			} else {
				// A $ref to a sub-schema with an $id (i.e #hello)
				section = findSchemaById(sourceRoot, sourceHandle, refSegment);
			}
			if (section) {
				merge(target, section);
			} else {
				resolveErrors.push(localize('json.schema.invalidid', '$ref \'{0}\' in \'{1}\' can not be resolved.', refSegment, sourceHandle.uri));
			}
		};

		const resolveExternalLink = (node: JSONSchema, uri: string, refSegment: string | undefined, parentHandle: SchemaHandle): Thenable<any> => {
			if (contextService && !/^[A-Za-z][A-Za-z0-9+\-.+]*:\/\/.*/.test(uri)) {
				uri = contextService.resolveRelativePath(uri, parentHandle.uri);
			}
			uri = normalizeId(uri);
			const referencedHandle = this.getOrAddSchemaHandle(uri);
			return referencedHandle.getUnresolvedSchema().then(unresolvedSchema => {
				parentHandle.dependencies.add(uri);
				if (unresolvedSchema.errors.length) {
					const loc = refSegment ? uri + '#' + refSegment : uri;
					resolveErrors.push(localize('json.schema.problemloadingref', 'Problems loading reference \'{0}\': {1}', loc, unresolvedSchema.errors[0]));
				}
				mergeRef(node, unresolvedSchema.schema, referencedHandle, refSegment);
				return resolveRefs(node, unresolvedSchema.schema, referencedHandle);
			});
		};

		const resolveRefs = (node: JSONSchema, parentSchema: JSONSchema, parentHandle: SchemaHandle): Thenable<any> => {
			const openPromises: Thenable<any>[] = [];

			this.traverseNodes(node, next => {
				const seenRefs = new Set<string>();
				while (next.$ref) {
					const ref = next.$ref;
					const segments = ref.split('#', 2);
					delete next.$ref;
					if (segments[0].length > 0) {
						// This is a reference to an external schema
						openPromises.push(resolveExternalLink(next, segments[0], segments[1], parentHandle));
						return;
					} else {
						// This is a reference inside the current schema
						if (!seenRefs.has(ref)) {
							const id = segments[1];
							mergeRef(next, parentSchema, parentHandle, id);
							seenRefs.add(ref);
						}
					}
				}
			});

			return this.promise.all(openPromises);
		};

		const collectAnchors = (root: JSONSchema): Map<string, JSONSchema> => {
			const result = new Map<string, JSONSchema>();
			this.traverseNodes(root, next => {
				const id = next.$id || next.id;
				if (typeof id === 'string' && id.charAt(0) === '#') {
					// delete next.$id;
					// delete next.id;
					const anchor = id.substring(1);
					if (result.has(anchor)) {
						resolveErrors.push(localize('json.schema.duplicateid', 'Duplicate id declaration: \'{0}\'', id));
					} else {
						result.set(anchor, next);
					}
				}
			});
			return result;
		};
		return resolveRefs(schema, schema, handle).then(_ => {
			return new ResolvedSchema(schema, resolveErrors);
		});
	}

	private traverseNodes(root: JSONSchema, handle: (node: JSONSchema) => void) {
		if (!root || typeof root !== 'object') {
			return Promise.resolve(null);
		}
		const seen = new Set<JSONSchema>();

		const collectEntries = (...entries: (JSONSchemaRef | undefined)[]) => {
			for (const entry of entries) {
				if (typeof entry === 'object') {
					toWalk.push(entry);
				}
			}
		};
		const collectMapEntries = (...maps: (JSONSchemaMap | undefined)[]) => {
			for (const map of maps) {
				if (typeof map === 'object') {
					for (const k in map) {
						const key = k as keyof JSONSchemaMap;
						const entry = map[key];
						if (typeof entry === 'object') {
							toWalk.push(entry);
						}
					}
				}
			}
		};
		const collectArrayEntries = (...arrays: (JSONSchemaRef[] | undefined)[]) => {
			for (const array of arrays) {
				if (Array.isArray(array)) {
					for (const entry of array) {
						if (typeof entry === 'object') {
							toWalk.push(entry);
						}
					}
				}
			}
		};

		const toWalk: JSONSchema[] = [root];

		let next = toWalk.pop();
		while (next) {
			if (!seen.has(next)) {
				seen.add(next);
				handle(next);
				collectEntries(<JSONSchema>next.items, next.additionalItems, <JSONSchema>next.additionalProperties, next.not, next.contains, next.propertyNames, next.if, next.then, next.else);
				collectMapEntries(next.definitions, next.properties, next.patternProperties, <JSONSchemaMap>next.dependencies);
				collectArrayEntries(next.anyOf, next.allOf, next.oneOf, <JSONSchema[]>next.items);
			}
			next = toWalk.pop();
		}
	};

	private getSchemaFromProperty(resource: string, document: Parser.JSONDocument): string | undefined {
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

	public getSchemaURIsForResource(resource: string, document?: Parser.JSONDocument): string[] {
		let schemeId = document && this.getSchemaFromProperty(resource, document);
		if (schemeId) {
			return [schemeId];
		}
		return this.getAssociatedSchemas(resource);
	}

	public getSchemaForResource(resource: string, document?: Parser.JSONDocument): Thenable<ResolvedSchema | undefined> {
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

	public getMatchingSchemas(document: TextDocument, jsonDocument: Parser.JSONDocument, schema?: JSONSchema): Thenable<MatchingSchema[]> {
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

function normalizeId(id: string): string {
	// remove trailing '#', normalize drive capitalization
	try {
		return URI.parse(id).toString(true);
	} catch (e) {
		return id;
	}

}

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
