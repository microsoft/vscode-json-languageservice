/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { TextEdit} from 'vscode-languageserver-textdocument';
import { createScanner, SyntaxKind, JSONScanner } from 'jsonc-parser';
import { TextDocument, FormattingOptions } from '../jsonLanguageTypes';
import { format } from './format';
import { PropertyTree, Container} from './propertyTree';

export function sort(documentToSort: TextDocument, formattingOptions: FormattingOptions): string {
    const options = { 
        tabSize: formattingOptions.tabSize ? formattingOptions.tabSize : 4,
        insertFinalNewline: formattingOptions.insertFinalNewline === true,
        insertSpaces: true, 
        keepLines: false,
        eol: '\n'
    };
    let formattedJSONString: string = TextDocument.applyEdits(documentToSort, format(documentToSort, options, undefined));
    console.log('formattedJSONString : ', formattedJSONString)
    const arrayOfLines: string[] = formattedJSONString.split('\n');
    const sortingRange : number[] = findSortingRange(arrayOfLines);
    const propertyTree : PropertyTree = findPropertyTree(formattedJSONString, sortingRange[0])
    console.log('propertyTree : ', propertyTree)
    sortingRange[0]++;
    sortingRange[1]--;
    const sortedArrayOfLines = sortLinesOfArray(arrayOfLines, propertyTree, sortingRange);
    const sortedDocument: TextDocument = TextDocument.create('test://test.json', 'json', 0, sortedArrayOfLines.join('\n'));
    const edits: TextEdit[] = format(sortedDocument, options, undefined);
    return TextDocument.applyEdits(sortedDocument, edits);
}

function findSortingRange(arrayOfLines: string[]): number[] {
    let beginningLineRange: number = 0;
    let endLineRange: number = 0;
    const range: number[] = [];
    for (let i = 0; i < arrayOfLines.length; i++) {
        if (arrayOfLines[i].includes('{') || arrayOfLines[i].includes('[')) {
            beginningLineRange = i;
            break;
        }
    }
    for (let i = arrayOfLines.length - 1; i >= 0; i--) {
        if (arrayOfLines[i].includes('}') || arrayOfLines[i].includes(']')) {
            endLineRange = i;
            break;
        }
    }
    range.push(beginningLineRange, endLineRange);
    return range;
}

function findPropertyTree(formattedString : string, startLine : number) {
    const scanner : JSONScanner = createScanner(formattedString, false);
    let rootTree : PropertyTree = new PropertyTree();
    let currentTree : PropertyTree | undefined = rootTree;
    let currentProperty : PropertyTree | undefined = rootTree;
    let token : SyntaxKind | undefined = undefined;
    let lastNonTriviaNonCommentToken : SyntaxKind | undefined = undefined;
    let lineOfLastNonTriviaNonCommentToken : number = -1;
    let beginningLineNumber : number = startLine;
    let currentContainerStack : Container[] = []
    let numberOfCharactersOnPreviousLines : number = 0;
    let tempNumberOfCharacters : number = 0;
    let updateCurrentPropertyEndLineNumber : boolean = false;

    while ((token = scanner.scan()) !== SyntaxKind.EOF) {

        if (updateCurrentPropertyEndLineNumber === true && currentProperty) {
            let endLineNumber = scanner.getTokenStartLine();
            currentProperty.endLineNumber = endLineNumber;
            beginningLineNumber = endLineNumber + 1;
            updateCurrentPropertyEndLineNumber = false;
        }

        console.log('token : ', token);

        switch(token) { 
            case SyntaxKind.StringLiteral: {
                if ((lastNonTriviaNonCommentToken === undefined 
                    || lastNonTriviaNonCommentToken === SyntaxKind.OpenBraceToken 
                    || (lastNonTriviaNonCommentToken === SyntaxKind.CommaToken && currentContainerStack[currentContainerStack.length - 1] === Container.Object)) && currentTree) {
                        currentProperty = currentTree.addChildProperty(scanner.getTokenValue(), beginningLineNumber);
                }
                break;
            }
            case SyntaxKind.OpenBracketToken: {
                currentContainerStack.push(Container.Array)
                break;
            }
            case SyntaxKind.OpenBraceToken: {
                currentContainerStack.push(Container.Object)
                currentTree = currentProperty;
                beginningLineNumber++;
                break;
            }
            case SyntaxKind.CloseBracketToken: {
                currentContainerStack.pop();
                break;
            }
            case SyntaxKind.CloseBraceToken: { 
                currentContainerStack.pop();
                currentTree = currentTree? currentTree.parent : undefined;
                const endLineNumber = scanner.getTokenStartLine();
                beginningLineNumber = endLineNumber + 1;
                if( lastNonTriviaNonCommentToken !== SyntaxKind.OpenBraceToken && currentProperty) {
                    currentProperty.endLineNumber = endLineNumber - 1;
                    currentProperty.lastProperty = true;
                }
                currentProperty = currentProperty ? currentProperty.parent : undefined;
                break;
            }
            case SyntaxKind.CommaToken: {
                let endLineNumber = scanner.getTokenStartLine();
                if (currentContainerStack[currentContainerStack.length - 1] === Container.Object && currentProperty) {
                    currentProperty.endLineNumber = endLineNumber;
                    currentProperty.commaIndex = scanner.getTokenOffset() - numberOfCharactersOnPreviousLines - 1;
                    currentProperty.commaLine = endLineNumber;
                }
                beginningLineNumber = endLineNumber + 1;
                break;
            }
            case SyntaxKind.BlockCommentTrivia: {
                if(lastNonTriviaNonCommentToken === SyntaxKind.CommaToken 
                    && lineOfLastNonTriviaNonCommentToken === scanner.getTokenStartLine()) {
                        updateCurrentPropertyEndLineNumber = true;
                }
                break;
            }
            case SyntaxKind.LineBreakTrivia: {
                numberOfCharactersOnPreviousLines = numberOfCharactersOnPreviousLines + tempNumberOfCharacters;
                tempNumberOfCharacters = 0;
            }
        }

        if(token !== SyntaxKind.LineBreakTrivia
            && token !== SyntaxKind.BlockCommentTrivia
            && token !== SyntaxKind.LineCommentTrivia
            && token !== SyntaxKind.Trivia) {
                lastNonTriviaNonCommentToken = token;
                lineOfLastNonTriviaNonCommentToken = scanner.getTokenStartLine();
        }
        
        tempNumberOfCharacters += scanner.getTokenLength();
    }
    return rootTree;
}

function sortLinesOfArray(arrayOfLines : string[], propertyTree: PropertyTree, sortingRange : number[]) {

    if (propertyTree.childrenProperties.length <= 1) {
        return arrayOfLines;
    }
    
    const sortedArrayOfLines = Object.assign([], arrayOfLines);
    const queueToSort = []
    queueToSort.push({'beginningLineNumber' : sortingRange[0], 'propertyArray': propertyTree.childrenProperties})

    while (queueToSort.length > 0) {

        const dataToSort = queueToSort.shift()
        const propertyArray : PropertyTree[] = dataToSort!['propertyArray'];
        console.log('\n')
        console.log('propertyArray : ', propertyArray)
        let beginningLineNumber : number = dataToSort!['beginningLineNumber']

        for (let i = 0; i < propertyArray.length; i++) {

            const property = propertyArray[i]
            const jsonContentToReplace = arrayOfLines.slice(property.beginningLineNumber, property.endLineNumber! + 1);

            if (property.lastProperty === true && i !== propertyArray.length - 1) {
                jsonContentToReplace[jsonContentToReplace.length - 1] = jsonContentToReplace[jsonContentToReplace.length - 1] + ',';
            } else if (property.lastProperty === false && i === propertyArray.length - 1) {
                const commaIndex = property.commaIndex;
                const commaLine = property.commaLine;
                jsonContentToReplace[commaLine! - property.beginningLineNumber!] = jsonContentToReplace[commaLine! - property.beginningLineNumber!].slice(0, commaIndex) + jsonContentToReplace[commaLine! - property.beginningLineNumber!].slice(commaIndex! + 1);
            }
            console.log('jsonContentToReplace : ', jsonContentToReplace)
            console.log('beginningLineNumber : ', beginningLineNumber)
            const length = property.endLineNumber! - property.beginningLineNumber! + 1;
            sortedArrayOfLines.splice(beginningLineNumber, length);
            sortedArrayOfLines.splice(beginningLineNumber, 0, ...jsonContentToReplace);
            console.log('sortedArrayOfLines : ', sortedArrayOfLines)
            if(property.childrenProperties.length > 1) {
                let minimumBeginningLineNumber = Infinity;
                for(const childProperty of property.childrenProperties) {
                    if(childProperty.beginningLineNumber! < minimumBeginningLineNumber) {
                        minimumBeginningLineNumber = childProperty.beginningLineNumber!;
                    }
                }
                console.log('minimumBeginningLineNumber : ', minimumBeginningLineNumber)
                const diff = minimumBeginningLineNumber - property.beginningLineNumber!;
                console.log('diff : ', diff)
                queueToSort.push({'beginningLineNumber' : beginningLineNumber + diff, 'propertyArray' : property.childrenProperties})
            }
            beginningLineNumber = beginningLineNumber + length;
        }
    }
    return sortedArrayOfLines;
}


  