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

    // variables which are used in order to find out where to place the comma if it needs to be placed
    // avoids the case of placing a comma at the end of a comma (thus equivalent to no separating comma)
    let lineOfLastNonTriviaNonCommentToken : number = -1;
    let indexOfLastNonTriviaNonCommentToken : number = -1;

    let beginningLineNumber : number = startLine;
    let currentContainerStack : Container[] = []
    let propertiesVisited : PropertyTree[] = []
    let numberOfCharactersOnPreviousLines : number = 0;
    let tempNumberOfCharacters : number = 0;
    let updateCurrentPropertyEndLineNumber : boolean = false;
    propertiesVisited.push(rootTree)

    while ((token = scanner.scan()) !== SyntaxKind.EOF) {

        if (updateCurrentPropertyEndLineNumber === true && currentProperty) {
            if(token !== SyntaxKind.LineBreakTrivia && token !== SyntaxKind.Trivia) {
                let endLineNumber = scanner.getTokenStartLine();
                currentProperty.endLineNumber = endLineNumber - 1;
                updateCurrentPropertyEndLineNumber = false;
            }
        }

        console.log('***')
        console.log('\n')
        console.log('token : ', token);
        console.log('token.value : ', scanner.getTokenValue());
        console.log('token.line : ', scanner.getTokenStartLine())

        switch(token) {

            // When we encounter a string literal, if it is after a comma and inside an object -> key
            // if it is apfter an open brace -> key
            // otherwise it is a simple string value
            case SyntaxKind.StringLiteral: {
                if ((lastNonTriviaNonCommentToken === undefined 
                    || lastNonTriviaNonCommentToken === SyntaxKind.OpenBraceToken 
                    || (lastNonTriviaNonCommentToken === SyntaxKind.CommaToken && currentContainerStack[currentContainerStack.length - 1] === Container.Object)) && currentTree) {

                        let childProperty : PropertyTree = new PropertyTree(scanner.getTokenValue(), beginningLineNumber);
                        currentProperty = currentTree.addChildProperty(childProperty);
                        propertiesVisited.push(currentProperty)
                }
                break;
            }
            // When token is open brace token, we find the type of the current property
            // a property can have as a value, an array like in this example, an object, or some number or string
            case SyntaxKind.OpenBracketToken: {
                currentContainerStack.push(Container.Array)
                if (currentProperty) {
                    currentProperty.type = Container.Array;
                }
                currentTree = currentProperty;
                break;
            }
            // When token is open brace token, we find the type of the current property
            // a property can have as a value, an array, an object like in this example, or some number or string
            case SyntaxKind.OpenBraceToken: {
                console.log('Before the curent property and current tree are changed inside of OpenBraceToken')
                console.log('currentContainerStack : ', currentContainerStack)
                console.log('currentTree : ', currentTree)
                console.log('currentProperty : ', currentProperty)

                if(currentContainerStack[currentContainerStack.length - 1] !== Container.Array || currentProperty && currentProperty.childrenProperties.length === 0) {
                    currentTree = currentProperty;
                }
                beginningLineNumber = scanner.getTokenStartLine();
                if(currentContainerStack[currentContainerStack.length - 1] === Container.Array && currentTree) {
                    console.log('noKeyName case')
                    // Adding a new property which does not have a name, it has an empty name
                    let childProperty : PropertyTree = new PropertyTree(scanner.getTokenValue(), beginningLineNumber);
                    childProperty.noKeyName = true;
                    currentProperty = currentTree.addChildProperty(childProperty);
                    propertiesVisited.push(currentProperty)
                }
                currentContainerStack.push(Container.Object)
                if(currentProperty) {
                    currentProperty.type = Container.Object;
                }
                currentTree = currentProperty;
                beginningLineNumber++;
                break;
            }
            case SyntaxKind.CloseBracketToken: {
                console.log('Before the current property and the current tree are changed inside of CloseBracketToken')
                console.log('currentContainerStack : ', currentContainerStack)
                console.log('currentTree : ', currentTree)
                console.log('currentProperty : ', currentProperty)
                
                const endLineNumber = scanner.getTokenStartLine();
                if (currentProperty) {
                    currentProperty.endLineNumber = endLineNumber - 1;
                    currentProperty.lastProperty = true;
                }
                beginningLineNumber = endLineNumber + 1;
                currentProperty = currentProperty ? currentProperty.parent : undefined;
                // for(let j = propertiesVisited.length - 1; j >= 0; j--) {
                //    if(propertiesVisited[j].type === Container.Array) {
                //        propertiesVisited[j].endLineNumber = endLineNumber;
                //        break;
                //    }
                // }
                currentContainerStack.pop();
                propertiesVisited.pop()
                break;
            }
            case SyntaxKind.CloseBraceToken: {
                console.log('close brace token')
                console.log('currenTree before change : ', currentTree);
                console.log('currentProperty before change : ', currentProperty)
                currentContainerStack.pop();
                currentTree = currentTree? currentTree.parent : undefined;
                const endLineNumber = scanner.getTokenStartLine();
                if( lastNonTriviaNonCommentToken !== SyntaxKind.OpenBraceToken && currentProperty && currentTree) {

                    currentProperty.endLineNumber = endLineNumber - 1;
                    currentProperty.lastProperty = true;
                    currentProperty.lineWhereToAddComma = lineOfLastNonTriviaNonCommentToken;
                    currentProperty.indexWhereToAddComa = indexOfLastNonTriviaNonCommentToken;
                    console.log('currentProperty after change before parent : ', currentProperty)
                    // currentTree.endLineNumber = endLineNumber;
                }
                beginningLineNumber = endLineNumber + 1;
                currentProperty = currentProperty ? currentProperty.parent : undefined;
                propertiesVisited.pop()
                break;
            }
            case SyntaxKind.CommaToken: {
                let endLineNumber = scanner.getTokenStartLine();
                if ((currentContainerStack[currentContainerStack.length - 1] === Container.Object || (currentContainerStack[currentContainerStack.length - 1] === Container.Array && lastNonTriviaNonCommentToken === SyntaxKind.CloseBraceToken )) && currentProperty) {
                    currentProperty.endLineNumber = endLineNumber;
                    currentProperty.commaIndex =  scanner.getTokenOffset() - numberOfCharactersOnPreviousLines - 1; // indexOfLastNonTriviaNonCommentToken
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
            && token !== SyntaxKind.Trivia
            && token !== SyntaxKind.ColonToken) {
                lastNonTriviaNonCommentToken = token;
                lineOfLastNonTriviaNonCommentToken = scanner.getTokenStartLine();
                indexOfLastNonTriviaNonCommentToken = scanner.getTokenOffset() + scanner.getTokenLength() - numberOfCharactersOnPreviousLines;
        }
        
        tempNumberOfCharacters += scanner.getTokenLength();

        if(token !== SyntaxKind.LineBreakTrivia
            && token !== SyntaxKind.Trivia
            && token !== SyntaxKind.BlockCommentTrivia
            && token !== SyntaxKind.LineCommentTrivia) {
                console.log('*** After Changes ***')
                console.log('propertiesVisited : ', propertiesVisited)
                console.log('currentTree : ', currentTree)
                console.log('currentTree.childrenProperties.length : ', currentTree?.childrenProperties.length)
                console.log('currentProperty : ', currentProperty)
                console.log('currentProperty.childrenProperties.length : ', currentProperty?.childrenProperties.length)
                console.log('beginningLineNumber : ', beginningLineNumber)
            }
    }
    return rootTree;
}

function sortLinesOfArray(arrayOfLines : string[], propertyTree: PropertyTree, sortingRange : number[]) {

    console.log('\n')
    console.log('***')
    console.log('sortLinesOfArray')
    console.log('***')
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

            console.log('i : ', i)
            const property = propertyArray[i]
            console.log('property : ', property);
            const jsonContentToReplace = arrayOfLines.slice(property.beginningLineNumber, property.endLineNumber! + 1);
            console.log('range beginningLineNumber : ', property.beginningLineNumber);
            console.log('range endLineNumber : ', property.endLineNumber);
            console.log('jsonContentToReplace before adding or removing commas : ', jsonContentToReplace);

            if (property.lastProperty === true && i !== propertyArray.length - 1) {
                const lineWhereToAddComma = property.lineWhereToAddComma ? property.lineWhereToAddComma - property.beginningLineNumber! : jsonContentToReplace.length - 1;
                const line = jsonContentToReplace[lineWhereToAddComma];
                const lineLength = line.length;
                const indexWhereToAddComma = property.indexWhereToAddComa ? property.indexWhereToAddComa: lineLength - 1;
                console.log('lineWhereToAddComma : ', lineWhereToAddComma)
                console.log('indexWhereToAddComma : ', indexWhereToAddComma);
                jsonContentToReplace[lineWhereToAddComma] = line.slice(0, indexWhereToAddComma) + ',' + line.slice(indexWhereToAddComma);
            } else if (property.lastProperty === false && i === propertyArray.length - 1) {
                const commaIndex = property.commaIndex;
                const commaLine = property.commaLine;
                console.log('commaIndex : ', commaIndex);
                console.log('commaLine! - property.beginningLineNumber! : ', commaLine! - property.beginningLineNumber!);
                jsonContentToReplace[commaLine! - property.beginningLineNumber!] = jsonContentToReplace[commaLine! - property.beginningLineNumber!].slice(0, commaIndex) + jsonContentToReplace[commaLine! - property.beginningLineNumber!].slice(commaIndex! + 1);
            }
            console.log('jsonContentToReplace : ', jsonContentToReplace)
            // console.log('beginningLineNumber : ', beginningLineNumber)
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
                // console.log('minimumBeginningLineNumber : ', minimumBeginningLineNumber)
                const diff = minimumBeginningLineNumber - property.beginningLineNumber!;
                // console.log('diff : ', diff)
                queueToSort.push({'beginningLineNumber' : beginningLineNumber + diff, 'propertyArray' : property.childrenProperties})
            }
            beginningLineNumber = beginningLineNumber + length;
        }
    }
    return sortedArrayOfLines;
}


  