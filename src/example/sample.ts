

import { getLanguageService, TextDocument } from '../jsonLanguageService';

async function main() {
    const jsonContentUri = 'foo://server/example.data.json';
    const jsonContent =
    `{
       "name": 12
       "country": "Ireland"
    }`;
    const jsonSchemaUri = "foo://server/data.schema.json";
    const jsonSchema = {
        "type": "object",
        "properties": {
            "name": {
                "type": "string"
            },
            "country": {
                "type": "string",
                "enum": ["Ireland", "Iceland"]
            }
        }
    };


    const textDocument = TextDocument.create(jsonContentUri, 'json', 1, jsonContent);

    const jsonLanguageService = getLanguageService({
        schemaRequestService: (uri) => {
            if (uri === jsonSchemaUri) {
                return Promise.resolve(JSON.stringify(jsonSchema));
            }
            return Promise.reject(`Unabled to load schema at ${uri}`);
        }
    });
    // associate `*.data.json` with the `foo://server/data.schema.json` schema
    jsonLanguageService.configure({ allowComments: false, schemas: [{ fileMatch: ["*.data.json"], uri: jsonSchemaUri }] });

    const jsonDocument = jsonLanguageService.parseJSONDocument(textDocument);

    const diagnostics = await jsonLanguageService.doValidation(textDocument, jsonDocument);
    console.log('Validation results:', diagnostics.map(d => `[line ${d.range.start.line}] ${d.message}`));

    /*
     * > Validation results: [
     * >    '[line 1] Incorrect type. Expected "string".',
     * >    '[line 2] Expected comma'
     * > ]
     */

    const competionResult = await jsonLanguageService.doComplete(textDocument, { line: 2, character: 18 }, jsonDocument);
    console.log('Completion proposals:', competionResult?.items.map(i => `${i.label}`));

    /*
     * Completion proposals: [ '"Ireland"', '"Iceland"' ]
     */

}
main();
