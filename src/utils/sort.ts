import { TextEdit } from 'vscode-languageserver-textdocument';
import { TextDocument, FormattingOptions } from '../jsonLanguageTypes';
import { format } from './format';

enum ValueType {
    string = 'string',
    numberOrBoolean = 'numberOrBoolean',
    array = 'array',
    object = 'object',
    undefined = 'undefined',
};

export function sort(documentToSort: TextDocument, options: FormattingOptions): string {
    let formattedJSONString: string = TextDocument.applyEdits(documentToSort, format(documentToSort, undefined, options));
    if (options.keepLines) {
        formattedJSONString = addNewLines(formattedJSONString);
    };
    let arrayOfLines: string[] = formattedJSONString.split('\n');
    let range: number[] = findBeginningAndEndOfRange(arrayOfLines);
    arrayOfLines = sortLinesOfArray(arrayOfLines, range[0], range[1]);
    let document: TextDocument = TextDocument.create('test://test.json', 'json', 0, arrayOfLines.join('\n'));
    let edits: TextEdit[] = format(document, undefined, options);
    return TextDocument.applyEdits(document, edits);
}

// When options.keepsLines in formatting is set to true, make sure all properties are separated by new lines
function addNewLines(text: string): string {
    // 0 -> object
    // 1 -> array
    let isCurrentstackOrObject: number[] = [];
    let arrayOfCharacters: string[] = [...text];
    let length: number = arrayOfCharacters.length;
    let char: string;
    for (let i = 0; i < length; i++) {
        char = arrayOfCharacters[i];
        switch (char) {
            case '{': {
                isCurrentstackOrObject.push(0);
                break;
            }
            case '[': {
                isCurrentstackOrObject.push(1);
                break;
            }
            case '}':
            case ']': {
                isCurrentstackOrObject.pop();
                break;
            }
            default: {
                break;
            }
        }
        if (char === '{' || char === '}' || (isCurrentstackOrObject[isCurrentstackOrObject.length - 1] === 0 && char === ',')) {
            let nNewLines: number[] = needsNewLines(arrayOfCharacters, i);
            let nLinesAfter: number = nNewLines[1];
            if (nLinesAfter > 0) {
                arrayOfCharacters.splice(i + nLinesAfter, 0, '\n');
                length++;
                i++;
            }
            let nLinesBefore: number = nNewLines[0];
            if (nLinesBefore > 0) {
                arrayOfCharacters.splice(i - nLinesBefore, 0, '\n');
                length++;
                i++;
            }
        }
    }
    return arrayOfCharacters.join("");
}

// Returns the relative offset positions of the new lines to add to the left and to the right of the character located at index
function needsNewLines(arrayOfCharacters: string[], index: number): number[] {
    let currentCharacter: string = arrayOfCharacters[index];
    let nextTwoNonSpaceCharacters: Record<string, any>;
    if (currentCharacter === '{' || currentCharacter === ',') {
        nextTwoNonSpaceCharacters = findNextTwoNonSpaceCharacters(arrayOfCharacters, index);
        if (nextTwoNonSpaceCharacters["0"] === '\n' || (nextTwoNonSpaceCharacters["0"] === '/' && nextTwoNonSpaceCharacters["1"] === '/')) {
            return [0, 0];
        } else {
            return [0, 1];
        }
    } else if (currentCharacter === '}') {
        let nLines: number[] = [0, 0];
        nextTwoNonSpaceCharacters = findNextTwoNonSpaceCharacters(arrayOfCharacters, index);
        if (index !== arrayOfCharacters.lastIndexOf('}') && nextTwoNonSpaceCharacters["0"] !== ' ' && !(nextTwoNonSpaceCharacters["0"] === '\n' || nextTwoNonSpaceCharacters["0"] === ',' || nextTwoNonSpaceCharacters["0"] === '}' || (nextTwoNonSpaceCharacters["0"] === '/' && nextTwoNonSpaceCharacters["1"] === '/'))) {
            nLines[1] = 1;
        }
        nextTwoNonSpaceCharacters = findNextTwoNonSpaceCharacters(arrayOfCharacters, index, true);
        if (nextTwoNonSpaceCharacters["0"] !== ' ' && nextTwoNonSpaceCharacters["0"] !== '\n') {
            nLines[0] = 1;
        }
        return nLines;
    }
    return [0, 0];
};

function findNextTwoNonSpaceCharacters(arrayOfCharacters: string[], index: number, reverse: boolean = false): Record<string, any> {
    let charactersAndPositions: Record<string, any> = {};
    if (!reverse) {
        for (let i = index + 1; i < arrayOfCharacters.length; i++) {
            if (arrayOfCharacters[i] !== ' ') {
                charactersAndPositions["0"] = arrayOfCharacters[i];
                charactersAndPositions["1"] = arrayOfCharacters[i + 1] || undefined;
                break;
            }
        }
    } else {
        for (let i = index - 1; i >= 0; i--) {
            if (arrayOfCharacters[i] !== ' ') {
                charactersAndPositions["0"] = arrayOfCharacters[i];
                charactersAndPositions["1"] = arrayOfCharacters[i - 1] || undefined;
                break;
            }
        }
    }
    return charactersAndPositions;
}

function validLastLineOfLastProperty(lastLine: string): boolean {
    for (let i = 0; i < lastLine.length; i++) {
        if (lastLine[i] === '}' || lastLine[i] === ']' || lastLine[i] === '"' || typeof lastLine[i] === 'string' || typeof lastLine[i] === 'number') {
            return true;
        }
        if (i < lastLine.length - 1 && lastLine[i] === '/' && (lastLine[i + 1] === '/' || lastLine[i + 1] === '*')) {
            return false;
        }
    }
    return false;
}

function findPropertyNameAndLineNumber(individualLines: string[], beginningLineOfProperty: number): Record<string, any> {
    let matches: RegExpMatchArray | null;
    let indexOfSecondDoubleQuoteInPropertyName: number = -1;
    let currentLine: string = "";
    let nameOfProperty: string = "";
    let propertyData: Record<string, any> = {};
    do {
        currentLine = individualLines[beginningLineOfProperty];
        matches = currentLine.match(/"((?:\\.|[^"\\])*)"/) || null;
        if (matches) {
            nameOfProperty = matches[0].slice(1, -1);
            indexOfSecondDoubleQuoteInPropertyName = currentLine.indexOf("\"", currentLine.indexOf("\"") + 1);
        } else {
            beginningLineOfProperty++;
        }
    } while (!matches);
    propertyData["nameOfProperty"] = nameOfProperty;
    propertyData["lineOfPropertyName"] = beginningLineOfProperty;
    propertyData["indexOfSecondDoubleQuoteInPropertyName"] = indexOfSecondDoubleQuoteInPropertyName;
    return propertyData;
}

// When keepLines === true, the colon is not necessarily on the same line as the property name
function findColonIndexAndLine(individualLines: string[], lineOfPropertyName: number, indexOfSecondDoubleQuoteInPropertyName: number) : Record<string, any> {
    let colonData : Record<string, any> = {};
    let colonIndex: number = individualLines[lineOfPropertyName].indexOf(':', indexOfSecondDoubleQuoteInPropertyName + 1);
    while (colonIndex === -1) {
        colonIndex = individualLines[lineOfPropertyName++].indexOf(':');
    }
    colonData["colonIndex"] = colonIndex;
    colonData["lineOfColon"] = lineOfPropertyName;
    return colonData;
}

function findValueTypeOfProperty(individualLines: string[], lineOfColon : number, colonIndex : number) : Record<string, any> {
    let i: number = colonIndex + 1;
    let valueType : ValueType = ValueType.undefined;
    let valueTypeData : Record<string, any> = {};
    do {
        const arrayCurrentLine: string[] = [...individualLines[lineOfColon]];
        for (; i < arrayCurrentLine.length; i++) {
            let char = arrayCurrentLine[i];
            if (char === '{') {
                valueType = ValueType.object;
                break;
            } else if (char === '[') {
                valueType = ValueType.array;
                break;
            } else if (char === '"') {
                valueType = ValueType.string;
                break;
            } else if (char !== '\n' && char !== ' ') {
                valueType = ValueType.numberOrBoolean;
                break;
            }
        }
        i = 0;
        if (valueType === ValueType.undefined) {
            lineOfColon++;
        }
    } while (valueType === ValueType.undefined);
    valueTypeData["valueType"] = valueType;
    valueTypeData["beginningLineOfValue"] = lineOfColon;
    return valueTypeData;
}

function findIfValueContainsObjectAndEndLine(individualLines : string[], beginningLineOfValue: number, valueType : ValueType) : Record<string, any> {
    let containsObject : boolean = false;
    let valueData : Record<string, any> = {};
    let isFirstLine : boolean = true;
    if (valueType === ValueType.array || ValueType.object) {
        let balanceOfBracketAndBraceTokens: number = 0;
        let arrayCurrentLine: string[];

        while (true) {
            arrayCurrentLine = [...individualLines[beginningLineOfValue]];
            arrayCurrentLine.map(char => {
                if (char === '{' || char === '[') {
                    balanceOfBracketAndBraceTokens++;
                    if (char === '{' && !isFirstLine) {
                        containsObject = true;
                    }
                } else if (char === '}' || char === ']') {
                    balanceOfBracketAndBraceTokens--;
                }
            });
            if (balanceOfBracketAndBraceTokens === 0) {
                break;
            } else {
                beginningLineOfValue++;
                isFirstLine = false;
            }
        }
    }
    valueData["containsObject"] = containsObject;
    valueData["endLineValue"] = beginningLineOfValue;
    return valueData;
}

function findCommaIndexAndLine(individualLines : string[], endLineValue : number, endLineOfRange : number, valueType : ValueType) : Record<string, any> {
    let currentLine : string = "";
    let commaLine : number = endLineValue;
    let commaIndex : number = -1;
    let commaData : Record<string, any> = {};
    if (commaLine < endLineOfRange) {
        do {
            let matches: RegExpExecArray | null = null;
            currentLine = individualLines[commaLine];
            // Either the comma is the last character on the current string
            if (currentLine.charAt(currentLine.length - 1) === ',') {
                commaIndex = currentLine.length - 1;
            } else if (commaLine === endLineValue) {
                // Or the comma is on the same line as the end of the value and
                switch (valueType) {
                    // The comma is located between " and / 
                    case ValueType.string: {
                        matches = /"[^"\/]*\//.exec(currentLine);
                        break;
                    }
                    // The comma is located between an integer or letter and /
                    case ValueType.numberOrBoolean: {
                        matches = /[a-z0-9][^"\/]*\//.exec(currentLine);
                        break;
                    }
                    // The comma is located to the left of a /
                    case ValueType.object: {
                        matches = /^[^\/]*\//.exec(currentLine);
                        break;
                    }
                    // The comma is located between ] and /
                    case ValueType.array: {
                        matches = /[\]][^\/]*\//.exec(currentLine);
                        break;
                    }
                }
                if (matches) {
                    commaIndex = matches.index + matches.indexOf(',');
                } else {
                    commaLine++;
                }
            } else {
                // Either the comma is to the left of a /
                matches = /^[^\/]*\//.exec(currentLine);
                if (matches) {
                    commaIndex = matches.index + matches.indexOf(',');
                } else {
                    // Or the comma is between / and /
                    matches = /\/[^\/\/]*\//.exec(currentLine);
                    if (matches) {
                        commaIndex = matches.index + matches.indexOf(',');
                    } else {
                        commaLine++;
                    }
                }
            }
        } while (commaIndex === -1);
    }
    commaData["commaIndex"] = commaIndex;
    commaData["commaLine"] = commaLine;
    return commaData;
}

function findPropertyData(individualLines: string[], beginningLineOfRange: number, endLineOfRange: number): Record<string, any> {
    let propertyData : Record<string, any> = {}, currentLine: string = "", data : Record<string, any>;
    let beginningLineOfProperty: number, endLineOfProperty: number;
    let lineOfPropertyName: number, nameOfProperty: string = "", indexOfSecondDoubleQuoteInPropertyName: number = -1;
    let lineOfColon : number, colonIndex: number = -1;
    let beginningLineOfValue : number, endLineValue : number, valueType: ValueType = ValueType.undefined, containsObject: boolean = false;
    let commaIndex: number = -1;
    beginningLineOfProperty = endLineOfProperty = lineOfPropertyName = beginningLineOfRange;

    while (endLineOfProperty <= endLineOfRange) {
        data = findPropertyNameAndLineNumber(individualLines, beginningLineOfProperty);
        nameOfProperty = data.nameOfProperty;
        lineOfPropertyName = data.lineOfPropertyName;
        indexOfSecondDoubleQuoteInPropertyName = data.indexOfSecondDoubleQuoteInPropertyName;
        data = findColonIndexAndLine(individualLines, lineOfPropertyName, indexOfSecondDoubleQuoteInPropertyName);
        colonIndex = data.colonIndex;
        lineOfColon = data.lineOfColon;
        data  = findValueTypeOfProperty(individualLines, lineOfColon, colonIndex);
        valueType = data.valueType;
        beginningLineOfValue = data.beginningLineOfValue;
        data = findIfValueContainsObjectAndEndLine(individualLines, beginningLineOfValue, valueType);
        containsObject = data.containsObject;
        endLineValue = data.endLineValue;      
        data = findCommaIndexAndLine(individualLines, endLineValue, endLineOfRange, valueType);
        commaIndex = data.commaIndex;
        endLineOfProperty = data.commaLine;
        propertyData[nameOfProperty] = { "beginningLineOfProperty": beginningLineOfProperty, "endLineOfProperty": endLineOfProperty, "containsObject": containsObject, "valueType": valueType, "commaIndex": commaIndex };
        nameOfProperty = currentLine = "";
        valueType = ValueType.undefined;
        endLineOfProperty++;
        beginningLineOfProperty = lineOfPropertyName = endLineOfProperty;
        containsObject = false;
    }
    return propertyData;
}

function sortLinesWithPropertyData(individualLines : string[], propertyData : Record<string, any>, beginningLineOfRange : number, endLineOfRange : number) : Record<string, any> {
    let propertyLocation : Record<string, any>, propertyNumber: number = 0, endLineOfProperty : number, beginningLineOfProperty : number, individualProperty: string[];
    let indexAtWhichToAddcomma : number, commaIndex: number;
    let indexOfStartOfLineComment : number, indexOfStartOfBlockComment : number; 
    let lastLine : string, indexAtWhichToAdd: number = beginningLineOfRange;
    let sortedKeys: string[] = Object.keys(propertyData).sort();
    let propertyDataAfterSorting: Record<string, any> = JSON.parse(JSON.stringify(propertyData));
    let data : Record<string, any> = {};
    let sortedLinesArray: string[] = [...individualLines];
    // Remove content between beginningLineRange and endLineRange before adding back
    sortedLinesArray.splice(beginningLineOfRange, endLineOfRange - beginningLineOfRange + 1);
    for (let key of sortedKeys) {
        propertyLocation = propertyData[key];
        endLineOfProperty = propertyLocation?.endLineOfProperty;
        beginningLineOfProperty = propertyLocation?.beginningLineOfProperty;
        commaIndex = propertyLocation?.commaIndex;
        individualProperty = individualLines.slice(beginningLineOfProperty, endLineOfProperty + 1);
        propertyNumber++;
        lastLine = individualProperty[individualProperty.length - 1];
        if (propertyNumber === sortedKeys.length) {
            if (commaIndex >= 0) {
                lastLine = lastLine.slice(0, commaIndex) + lastLine.slice(commaIndex + 1);
            }
        } else {
            if (commaIndex === -1) {
                if (lastLine.includes("//") || lastLine.includes("/*")) {
                    indexOfStartOfLineComment = lastLine.indexOf("//") !== -1 ? lastLine.indexOf("//") : lastLine.length + 1;
                    indexOfStartOfBlockComment = lastLine.indexOf("/*") !== -1 ? lastLine.indexOf("/*") : lastLine.length + 1;
                    indexAtWhichToAddcomma = Math.min(indexOfStartOfLineComment, indexOfStartOfBlockComment) - 1;
                    if (indexAtWhichToAdd < lastLine.length) {
                        lastLine = lastLine.slice(0, indexAtWhichToAddcomma) + ',' + lastLine.slice(indexAtWhichToAddcomma);
                    }
                } else {
                    lastLine = lastLine + ',';
                }
            }
        }
        individualProperty.pop();
        individualProperty.push(lastLine);
        sortedLinesArray.splice(indexAtWhichToAdd, 0, ...individualProperty);
        propertyDataAfterSorting[key].beginningLineOfProperty = indexAtWhichToAdd;
        propertyDataAfterSorting[key].endLineOfProperty = indexAtWhichToAdd + endLineOfProperty - beginningLineOfProperty;
        indexAtWhichToAdd = indexAtWhichToAdd + endLineOfProperty - beginningLineOfProperty + 1;
    }
    data["propertyDataAfterSorting"] = propertyDataAfterSorting;
    data["sortedLinesArray"] = sortedLinesArray;
    return data;
}

function findNextNestedObjectInArray(individualLines : string[], beginningLineOfProperty : number, endLineOfProperty : number) : Record<string, number> {
    let beginningOfObjectFound: boolean = false;
    let data : Record<string, number> = {};
    let currentLine : string;
    do {
        currentLine = individualLines[beginningLineOfProperty];
        const arrayCurrentLine: string[] = [...currentLine];
        arrayCurrentLine.map(char => {
            if (char === '{') {
                beginningOfObjectFound = true;
            }
        });
        if (beginningOfObjectFound === false) {
            beginningLineOfProperty++;
        }
    } while (!beginningOfObjectFound);
    endLineOfProperty = beginningLineOfProperty;
    let balanceOfBraces: number = 0;
    do {
        currentLine = individualLines[endLineOfProperty];
        const arrayCurrentLine: string[] = [...currentLine];
        arrayCurrentLine.map(char => {
            if (char === "{") {
                balanceOfBraces++;
            } else if (char === "}") {
                balanceOfBraces--;
            }
        });
        if (balanceOfBraces !== 0) {
            endLineOfProperty++;
        }
    } while (balanceOfBraces !== 0);
    data["beginningLineOfProperty"] = beginningLineOfProperty;
    data["endLineOfProperty"] = endLineOfProperty;
    return data;
}

// one last problem seems to be to put a comma at the end of a property if it becomes the last one 
function sortLinesOfArray(individualLines: string[], beginningLineOfRange: number, endLineOfRange: number): string[] {
    let propertyLocation : Record<string, any>, beginningLineOfProperty : number, endLineOfProperty : number, valueType : ValueType, containsObject : boolean, nextObjectData : Record<string, number>, currentPropertyData: Record<string, any>;
    while (!validLastLineOfLastProperty(individualLines[endLineOfRange])) {
        endLineOfRange--;
    }
    if (endLineOfRange === beginningLineOfRange) {
        return individualLines;
    }
    let propertyData: Record<string, any> = findPropertyData(individualLines, beginningLineOfRange, endLineOfRange);
    let sortedData : Record<string, any> = sortLinesWithPropertyData(individualLines, propertyData, beginningLineOfRange, endLineOfRange);
    propertyData = sortedData.propertyDataAfterSorting;
    individualLines = sortedData.sortedLinesArray;

    // Conditions for recursion:
    // containsObject = true, valueType = "object" -> recurisvely sort
    // containsObject = true, valueType = "array" -> recurisvely sort each sub-object of the array
    // containsObject = false, valueType = "object" -> recursively sort once more
    // containsObject = false, valueType = "array" -> no need to recursively sort
    // valueType = "simple" -> no need to recursively sort

    for (let key of Object.keys(propertyData).sort()) {
        propertyLocation = propertyData[key];
        beginningLineOfProperty = propertyLocation?.beginningLineOfProperty;
        endLineOfProperty = propertyLocation?.endLineOfProperty;
        valueType = propertyLocation?.valueType;
        containsObject = propertyLocation?.containsObject;
        if (valueType === "object") {
            currentPropertyData = JSON.parse(JSON.stringify(propertyData));
            individualLines = sortLinesOfArray(individualLines, beginningLineOfProperty + 1, endLineOfProperty - 1);
            propertyData = JSON.parse(JSON.stringify(currentPropertyData));
        } else if (valueType === "array" && containsObject === true) {
            while (!individualLines[endLineOfRange].includes('}')) {
                endLineOfRange--;
            }
            endLineOfProperty = beginningLineOfProperty;
            while (endLineOfProperty < endLineOfRange) {
                nextObjectData = findNextNestedObjectInArray(individualLines, beginningLineOfProperty, endLineOfProperty);
                currentPropertyData = JSON.parse(JSON.stringify(propertyData));
                individualLines = sortLinesOfArray(individualLines, nextObjectData.beginningLineOfProperty + 1, nextObjectData.endLineOfProperty - 1);
                propertyData = JSON.parse(JSON.stringify(currentPropertyData));
                endLineOfProperty = nextObjectData.endLineOfProperty++;
                beginningLineOfProperty = endLineOfProperty;
            }
        }
    }
    return individualLines;
}

function findBeginningAndEndOfRange(arrayOfLines: string[]): number[] {
    let beginningLineRange: number = 0;
    let endLineRange: number = 0;
    let range: number[] = [];
    for (let i = 0; i < arrayOfLines.length; i++) {
        if (arrayOfLines[i].includes('{')) {
            beginningLineRange = i + 1;
            break;
        }
    }
    for (let i = arrayOfLines.length - 1; i >= 0; i--) {
        if (arrayOfLines[i].includes('}')) {
            endLineRange = i - 1;
            break;
        }
    }
    range.push(beginningLineRange, endLineRange);
    return range;
}