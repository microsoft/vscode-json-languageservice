/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Json from 'jsonc-parser';
import { JSONSchema, JSONSchemaMap, JSONSchemaRef } from '../jsonSchema';
import { URI } from 'vscode-uri';
import * as Strings from '../utils/strings';
import * as Parser from '../parser/jsonParser';
import { SchemaRequestService, WorkspaceContextService, PromiseConstructor, Thenable } from '../jsonLanguageTypes';

import * as nls from 'vscode-nls';

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
	getSchemaForResource(resource: string, document: Parser.JSONDocument): Thenable<ResolvedSchema>;

	/**
	 * Returns all registered schema ids
	 */
	getRegisteredSchemaIds(filter?: (scheme) => boolean): string[];
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
	url: string;

	/**
	 * The schema from the file, with potential $ref references
	 */
	getUnresolvedSchema(): Thenable<UnresolvedSchema>;

	/**
	 * The schema from the file, with references resolved
	 */
	getResolvedSchema(): Thenable<ResolvedSchema>;
}


class FilePatternAssociation {

	private readonly uris: string[];
	private readonly patternRegExps: RegExp[];
	private readonly isInclude: boolean[];

	constructor(pattern: string[], uris: string[]) {
		this.patternRegExps = [];
		this.isInclude = [];
		try {
			for (let p of pattern) {
				const include = p[0] !== '!';
				if (!include) {
					p = p.substring(1);
				}
				this.patternRegExps.push(new RegExp(Strings.convertSimple2RegExpPattern(p) + '$'));
				this.isInclude.push(include);
			}
			this.uris = uris;
		} catch (e) {
			// invalid pattern
			this.patternRegExps.length = 0;
			this.isInclude.length = 0;
			this.uris = [];
		}

	}

	public matchesPattern(fileName: string): boolean {
		let match = false;
		for (let i = 0; i < this.patternRegExps.length; i++) {
			const regExp = this.patternRegExps[i];
			if (regExp.test(fileName)) {
				match = this.isInclude[i];
			}
		}
		return match;
	}

	public getURIs() {
		return this.uris;
	}
}

type SchemaDependencies = { [uri: string]: true };

class SchemaHandle implements ISchemaHandle {

	public url: string;
	public dependencies: SchemaDependencies;

	private resolvedSchema: Thenable<ResolvedSchema>;
	private unresolvedSchema: Thenable<UnresolvedSchema>;
	private service: JSONSchemaService;

	constructor(service: JSONSchemaService, url: string, unresolvedSchemaContent?: JSONSchema) {
		this.service = service;
		this.url = url;
		this.dependencies = {};
		if (unresolvedSchemaContent) {
			this.unresolvedSchema = this.service.promise.resolve(new UnresolvedSchema(unresolvedSchemaContent));
		}
	}

	public getUnresolvedSchema(): Thenable<UnresolvedSchema> {
		if (!this.unresolvedSchema) {
			this.unresolvedSchema = this.service.loadSchema(this.url);
		}
		return this.unresolvedSchema;
	}

	public getResolvedSchema(): Thenable<ResolvedSchema> {
		if (!this.resolvedSchema) {
			this.resolvedSchema = this.getUnresolvedSchema().then(unresolved => {
				return this.service.resolveSchemaContent(unresolved, this.url, this.dependencies);
			});
		}
		return this.resolvedSchema;
	}

	public clearSchema() {
		this.resolvedSchema = null;
		this.unresolvedSchema = null;
		this.dependencies = {};
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

	public getSection(path: string[]): JSONSchema {
		return Parser.asSchema(this.getSectionRecursive(path, this.schema));
	}

	private getSectionRecursive(path: string[], schema: JSONSchemaRef): JSONSchemaRef {
		if (!schema || typeof schema === 'boolean' || path.length === 0) {
			return schema;
		}
		const next = path.shift();

		if (schema.properties && typeof schema.properties[next]) {
			return this.getSectionRecursive(path, schema.properties[next]);
		} else if (schema.patternProperties) {
			for (const pattern of Object.keys(schema.patternProperties)) {
				const regex = new RegExp(pattern);
				if (regex.test(next)) {
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

		return null;
	}
}

export class JSONSchemaService implements IJSONSchemaService {

	private contributionSchemas: { [id: string]: SchemaHandle };
	private contributionAssociations: FilePatternAssociation[];

	private schemasById: { [id: string]: SchemaHandle };
	private filePatternAssociations: FilePatternAssociation[];
	private registeredSchemasIds: { [id: string]: boolean };

	private contextService: WorkspaceContextService;
	private callOnDispose: Function[];
	private requestService: SchemaRequestService;
	private promiseConstructor: PromiseConstructor;

	private cachedSchemaForResource: { resource: string; resolvedSchema: Thenable<ResolvedSchema> } | undefined;

	constructor(requestService: SchemaRequestService, contextService?: WorkspaceContextService, promiseConstructor?: PromiseConstructor) {
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

	public getRegisteredSchemaIds(filter?: (scheme) => boolean): string[] {
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
			this.callOnDispose.pop()();
		}
	}

	public onResourceChange(uri: string): boolean {
		let hasChanges = false;
		uri = normalizeId(uri);

		const toWalk = [uri];
		const all: (SchemaHandle | undefined)[] = Object.keys(this.schemasById).map(key => this.schemasById[key]);

		while (toWalk.length) {
			const curr = toWalk.pop();
			for (let i = 0; i < all.length; i++) {
				const handle = all[i];
				if (handle && (handle.url === curr || handle.dependencies[curr])) {
					if (handle.url !== curr) {
						toWalk.push(handle.url);
					}
					handle.clearSchema();
					all[i] = undefined;
					hasChanges = true;
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

	private addFilePatternAssociation(pattern: string[], uris?: string[]): FilePatternAssociation {
		const fpa = new FilePatternAssociation(pattern, uris);
		this.filePatternAssociations.push(fpa);
		return fpa;
	}

	public registerExternalSchema(uri: string, filePatterns: string[] = null, unresolvedSchemaContent?: JSONSchema): ISchemaHandle {
		const id = normalizeId(uri);
		this.registeredSchemasIds[id] = true;
		this.cachedSchemaForResource = undefined;

		if (filePatterns) {
			this.addFilePatternAssociation(filePatterns, [uri]);
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

	public getResolvedSchema(schemaId: string): Thenable<ResolvedSchema> {
		const id = normalizeId(schemaId);
		const schemaHandle = this.schemasById[id];
		if (schemaHandle) {
			return schemaHandle.getResolvedSchema();
		}
		return this.promise.resolve(null);
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

	public resolveSchemaContent(schemaToResolve: UnresolvedSchema, schemaURL: string, dependencies: SchemaDependencies): Thenable<ResolvedSchema> {

		const resolveErrors: string[] = schemaToResolve.errors.slice(0);
		const schema = schemaToResolve.schema;

		if (schema.$schema) {
			const id = normalizeId(schema.$schema);
			if (id === 'http://json-schema.org/draft-03/schema') {
				return this.promise.resolve(new ResolvedSchema({}, [localize('json.schema.draft03.notsupported', "Draft-03 schemas are not supported.")]));
			} else if (id === 'https://json-schema.org/draft/2019-09/schema') {
				schemaToResolve.errors.push(localize('json.schema.draft201909.notsupported', "Draft 2019-09 schemas are not yet fully supported."));
			}
		}

		const contextService = this.contextService;

		const findSection = (schema: JSONSchema, path: string | undefined): any => {
			if (!path) {
				return schema;
			}
			let current: any = schema;
			if (path[0] === '/') {
				path = path.substr(1);
			}
			path.split('/').some((part) => {
				current = current[part];
				return !current;
			});
			return current;
		};

		const merge = (target: JSONSchema, sourceRoot: JSONSchema, sourceURI: string, refSegment: string | undefined): void => {
			const path = refSegment ? decodeURIComponent(refSegment) : undefined;
			const section = findSection(sourceRoot, path);
			if (section) {
				for (const key in section) {
					if (section.hasOwnProperty(key) && !target.hasOwnProperty(key)) {
						target[key] = section[key];
					}
				}
			} else {
				resolveErrors.push(localize('json.schema.invalidref', '$ref \'{0}\' in \'{1}\' can not be resolved.', path, sourceURI));
			}
		};

		const resolveExternalLink = (node: JSONSchema, uri: string, refSegment: string | undefined, parentSchemaURL: string, parentSchemaDependencies: SchemaDependencies): Thenable<any> => {
			if (contextService && !/^\w+:\/\/.*/.test(uri)) {
				uri = contextService.resolveRelativePath(uri, parentSchemaURL);
			}
			uri = normalizeId(uri);
			const referencedHandle = this.getOrAddSchemaHandle(uri);
			return referencedHandle.getUnresolvedSchema().then(unresolvedSchema => {
				parentSchemaDependencies[uri] = true;
				if (unresolvedSchema.errors.length) {
					const loc = refSegment ? uri + '#' + refSegment : uri;
					resolveErrors.push(localize('json.schema.problemloadingref', 'Problems loading reference \'{0}\': {1}', loc, unresolvedSchema.errors[0]));
				}
				merge(node, unresolvedSchema.schema, uri, refSegment);
				return resolveRefs(node, unresolvedSchema.schema, uri, referencedHandle.dependencies);
			});
		};

		const resolveRefs = (node: JSONSchema, parentSchema: JSONSchema, parentSchemaURL: string, parentSchemaDependencies: SchemaDependencies): Thenable<any> => {
			if (!node || typeof node !== 'object') {
				return Promise.resolve(null);
			}

			const toWalk: JSONSchema[] = [node];
			const seen: JSONSchema[] = [];

			const openPromises: Thenable<any>[] = [];

			const collectEntries = (...entries: JSONSchemaRef[]) => {
				for (const entry of entries) {
					if (typeof entry === 'object') {
						toWalk.push(entry);
					}
				}
			};
			const collectMapEntries = (...maps: JSONSchemaMap[]) => {
				for (const map of maps) {
					if (typeof map === 'object') {
						for (const key in map) {
							const entry = map[key];
							if (typeof entry === 'object') {
								toWalk.push(entry);
							}
						}
					}
				}
			};
			const collectArrayEntries = (...arrays: JSONSchemaRef[][]) => {
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
			const handleRef = (next: JSONSchema) => {
				const seenRefs = [];
				while (next.$ref) {
					const ref = next.$ref;
					const segments = ref.split('#', 2);
					delete next.$ref;
					if (segments[0].length > 0) {
						openPromises.push(resolveExternalLink(next, segments[0], segments[1], parentSchemaURL, parentSchemaDependencies));
						return;
					} else {
						if (seenRefs.indexOf(ref) === -1) {
							merge(next, parentSchema, parentSchemaURL, segments[1]); // can set next.$ref again, use seenRefs to avoid circle
							seenRefs.push(ref);
						}
					}
				}

				collectEntries(<JSONSchema>next.items, <JSONSchema>next.additionalProperties, next.not, next.contains, next.propertyNames, next.if, next.then, next.else);
				collectMapEntries(next.definitions, next.properties, next.patternProperties, <JSONSchemaMap>next.dependencies);
				collectArrayEntries(next.anyOf, next.allOf, next.oneOf, <JSONSchema[]>next.items);
			};

			while (toWalk.length) {
				const next = toWalk.pop();
				if (seen.indexOf(next) >= 0) {
					continue;
				}
				seen.push(next);
				handleRef(next);
			}
			return this.promise.all(openPromises);
		};

		return resolveRefs(schema, schema, schemaURL, dependencies).then(_ => new ResolvedSchema(schema, resolveErrors));
	}

	public getSchemaForResource(resource: string, document: Parser.JSONDocument): Thenable<ResolvedSchema> {

		// first use $schema if present
		if (document && document.root && document.root.type === 'object') {
			const schemaProperties = document.root.properties.filter(p => (p.keyNode.value === '$schema') && p.valueNode && p.valueNode.type === 'string');
			if (schemaProperties.length > 0) {
				let schemeId = <string>Parser.getNodeValue(schemaProperties[0].valueNode);
				if (schemeId && Strings.startsWith(schemeId, '.') && this.contextService) {
					schemeId = this.contextService.resolveRelativePath(schemeId, resource);
				}
				if (schemeId) {
					const id = normalizeId(schemeId);
					return this.getOrAddSchemaHandle(id).getResolvedSchema();
				}
			}
		}

		if (this.cachedSchemaForResource && this.cachedSchemaForResource.resource === resource) {
			return this.cachedSchemaForResource.resolvedSchema;
		}

		const seen: { [schemaId: string]: boolean } = Object.create(null);
		const schemas: string[] = [];
		for (const entry of this.filePatternAssociations) {
			if (entry.matchesPattern(resource)) {
				for (const schemaId of entry.getURIs()) {
					if (!seen[schemaId]) {
						schemas.push(schemaId);
						seen[schemaId] = true;
					}
				}
			}
		}
		const resolvedSchema = schemas.length > 0 ? this.createCombinedSchema(resource, schemas).getResolvedSchema() : this.promise.resolve(null);
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
}

function normalizeId(id: string): string {
	// remove trailing '#', normalize drive capitalization
	try {
		return URI.parse(id).toString();
	} catch (e) {
		return id;
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
