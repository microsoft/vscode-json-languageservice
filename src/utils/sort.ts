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
    // The tree that will be returned
    let rootTree : PropertyTree = new PropertyTree();
    // The tree where the properties can be added as children
    let currentTree : PropertyTree | undefined = rootTree;
    // The tree representing the current property analyzed
    let currentProperty : PropertyTree | undefined = rootTree;
    // The current scanned token
    let token : SyntaxKind | undefined = undefined;

    // The last token scanned that is not trivial, nor a comment
    let lastNonTriviaNonCommentToken : SyntaxKind | undefined = undefined;
    // Line number of last token that is not trivial, nor a comment
    let lineOfLastNonTriviaNonCommentToken : number = -1;
    // Index on its line of last token that is not trivial, nor a comment
    let indexOfLastNonTriviaNonCommentToken : number = -1;

    // Line number of the start of the range of current/next property
    let beginningLineNumber : number = startLine;
    // Line number of the end of the range of current/next property
    let endLineNumber : number = startLine;

    // Stack indicating whether we are inside of an object or an array
    let currentContainerStack : Container[] = []
    // Total number of characters on the lines prior to current line 
    let numberOfCharactersOnPreviousLines : number = 0;
    // Temporary number of characters on current line 
    let tempNumberOfCharacters : number = 0;
    // Boolean indicating that the current property end line number needs to be updated
    let updateCurrentPropertyEndLineNumber : boolean = false;

    while ((token = scanner.scan()) !== SyntaxKind.EOF) {

        if (updateCurrentPropertyEndLineNumber === true 
            && token !== SyntaxKind.LineBreakTrivia 
            && token !== SyntaxKind.Trivia 
            && currentProperty!.endLineNumber === undefined) {

            let endLineNumber = scanner.getTokenStartLine();
            currentProperty!.endLineNumber = endLineNumber - 1;
            updateCurrentPropertyEndLineNumber = false;
            beginningLineNumber = endLineNumber;
        }

        console.log('***')
        console.log('\n')
        console.log('token : ', token);
        console.log('token.value : ', scanner.getTokenValue());
        console.log('token.line : ', scanner.getTokenStartLine())

        switch(token) {

            // When a string is found, if it follows an open brace, a comma token and it is within an object, then it corresponds to a key name
            case SyntaxKind.StringLiteral: {
                if ((lastNonTriviaNonCommentToken === undefined 
                    || lastNonTriviaNonCommentToken === SyntaxKind.OpenBraceToken 
                    || (lastNonTriviaNonCommentToken === SyntaxKind.CommaToken && currentContainerStack[currentContainerStack.length - 1] === Container.Object))) {

                        let childProperty : PropertyTree = new PropertyTree(scanner.getTokenValue(), beginningLineNumber);
                        currentProperty = currentTree!.addChildProperty(childProperty);
                }
                break;
            }
            
            // When the token is an open bracket, then we enter into an array
            case SyntaxKind.OpenBracketToken: {
                currentContainerStack.push(Container.Array)
                currentProperty!.type = Container.Array;
                // Enter into the array
                currentTree = currentProperty;
                break;
            }
            
            // When the token is an open brace
            case SyntaxKind.OpenBraceToken: {
                console.log('Before the curent property and current tree are changed inside of OpenBraceToken')
                console.log('currentContainerStack : ', currentContainerStack)
                console.log('currentTree : ', currentTree)
                console.log('currentProperty : ', currentProperty)

                beginningLineNumber = scanner.getTokenStartLine();

                // The currentProperty has already been created but now we enter into it
                if(currentContainerStack[currentContainerStack.length - 1] === Container.Object ) { // || currentProperty!.childrenProperties.length === 0
                    console.log('Inside top if')
                    currentTree = currentProperty;
                } 
                // Otherwise this property has not yet been created and needs to be created
                else if (currentContainerStack[currentContainerStack.length - 1] === Container.Array) {
                    // The object found has no associated key, it is of the form: ["a", {...}, "b"]
                    console.log('noKeyName case')
                    let childProperty : PropertyTree = new PropertyTree(scanner.getTokenValue(), beginningLineNumber);
                    // In this case set the noKeyName propery to true
                    childProperty.noKeyName = true;
                    currentProperty = currentTree!.addChildProperty(childProperty);
                }

                currentProperty!.type = Container.Object;
                currentContainerStack.push(Container.Object);
                // Enter into the object
                currentTree = currentProperty;
                beginningLineNumber++;
                break;
            }
            case SyntaxKind.CloseBracketToken: {
                console.log('Before the current property and the current tree are changed inside of CloseBracketToken')
                console.log('currentContainerStack : ', currentContainerStack)
                console.log('currentTree : ', currentTree)
                console.log('currentProperty : ', currentProperty)
                
                endLineNumber = scanner.getTokenStartLine();

                // !!! basically handle the case differently for when we have no key name objects inside of the array
                // when we have no key-name objects, the current tree and the property tree coule already be at the level of the full array
                // but it could also be at the level of the inner object
                // consider for this the last non trivial non-comment object, whether it is an object or an array or some other value
                // if some other value, then current tree on the same level as property tree
                // if object or array, then property tree different from current tree

                // When currentTree === currentProperty, no object was found inside of the array, it is a simple (non-nested) array, endLineNumber does not need to be redefined
                // If currentProperty.endLineNumber is defined then it does not need to be redefined
                // Property has been found on the inside of the array

                // currentTree !== currentProperty -> all pass except for last
                // currentProperty!.childrenProperties.length > 0 -> 4 tests fail but last one passes

                // if an object has been found inside of the array that needs to have its number reassigned
                // for the case when 4 tests fail, currentTree is the actual array property and the children have already an end line assigned
                if (((currentContainerStack[currentContainerStack.length - 1] === Container.Array 
                    && currentProperty!.childrenProperties.length > 0)
                    || currentContainerStack[currentContainerStack.length - 1] === Container.Object)
                    && currentProperty!.endLineNumber === undefined) {

                    currentProperty!.endLineNumber = endLineNumber - 1;
                    // currentProperty!.lastProperty = true;

                    // While the end line number has not been set, do not go to parent of current property
                    currentProperty = currentProperty ? currentProperty.parent : undefined;
                    currentTree = currentProperty;
                }
                // currentProperty = currentProperty ? currentProperty.parent : undefined;
                // currentTree = currentProperty;
                beginningLineNumber = endLineNumber + 1;

                // wrong should be at the front
                currentContainerStack.pop();
                break;
            }
            case SyntaxKind.CloseBraceToken: {
                console.log('close brace token')
                console.log('currenTree before change : ', currentTree);
                console.log('currentProperty before change : ', currentProperty)

                endLineNumber = scanner.getTokenStartLine();
                currentContainerStack.pop();

                // If we are not inside of an empty object and current property end line number was not yet defined, define it
                if( lastNonTriviaNonCommentToken !== SyntaxKind.OpenBraceToken 
                    && currentProperty!.endLineNumber === undefined) {

                    currentProperty!.endLineNumber = endLineNumber - 1;
                    currentProperty!.lastProperty = true;

                    // The last property of an object is associated with the line and index of where to add the comma, in case after sorting, it is no longer at the end
                    currentProperty!.lineWhereToAddComma = lineOfLastNonTriviaNonCommentToken;
                    currentProperty!.indexWhereToAddComa = indexOfLastNonTriviaNonCommentToken;
                    console.log('currentProperty after change before parent : ', currentProperty)

                    currentProperty = currentProperty ? currentProperty.parent : undefined;
                    currentTree = currentProperty;
                }
                beginningLineNumber = endLineNumber + 1;
                break;
            }

            case SyntaxKind.CommaToken: {
                
                endLineNumber = scanner.getTokenStartLine();

                // If the last container is an object, or it is an array such that the last non trivia non-comment token is a brace, update hthe end line number of the current property
                if (currentProperty!.endLineNumber === undefined 
                    && (currentContainerStack[currentContainerStack.length - 1] === Container.Object 
                        || (currentContainerStack[currentContainerStack.length - 1] === Container.Array 
                            && lastNonTriviaNonCommentToken === SyntaxKind.CloseBraceToken ))) {

                    currentProperty!.endLineNumber = endLineNumber;
                    // Store the line and the index of the comma in case it needs to be removed during the sorting
                    currentProperty!.commaIndex =  scanner.getTokenOffset() - numberOfCharactersOnPreviousLines - 1;
                    currentProperty!.commaLine = endLineNumber;
                }

                if (lastNonTriviaNonCommentToken === SyntaxKind.CloseBraceToken || lastNonTriviaNonCommentToken === SyntaxKind.CloseBracketToken) {
                    currentProperty = currentProperty ? currentProperty.parent : undefined;
                    currentTree = currentProperty;
                }
                beginningLineNumber = endLineNumber + 1;
                break;
            }

            case SyntaxKind.BlockCommentTrivia: {
                
                // If the last non trivia non-comment token is a comma and the block comment starts on the same line as the comma, then update the end line number
                if(lastNonTriviaNonCommentToken === SyntaxKind.CommaToken 
                    && lineOfLastNonTriviaNonCommentToken === scanner.getTokenStartLine()) {
                        currentProperty!.endLineNumber = undefined;
                        updateCurrentPropertyEndLineNumber = true;
                }
                break;
            }

            // If a line break trivia is encountered, add the number of characters on the current line to the total, reset the temporary variable
            case SyntaxKind.LineBreakTrivia: {
                numberOfCharactersOnPreviousLines = numberOfCharactersOnPreviousLines + tempNumberOfCharacters;
                tempNumberOfCharacters = 0;
            }
        }

        // For all non-comment, non-trvia tokens, update the line and index of the last non-trivia non-comment token
        if(token !== SyntaxKind.LineBreakTrivia
            && token !== SyntaxKind.BlockCommentTrivia
            && token !== SyntaxKind.LineCommentTrivia
            && token !== SyntaxKind.Trivia) {
        
                lastNonTriviaNonCommentToken = token;
                lineOfLastNonTriviaNonCommentToken = scanner.getTokenStartLine();
                indexOfLastNonTriviaNonCommentToken = scanner.getTokenOffset() + scanner.getTokenLength() - numberOfCharactersOnPreviousLines;
        }
        
        tempNumberOfCharacters += scanner.getTokenLength();

        if(token !== SyntaxKind.LineBreakTrivia
            && token !== SyntaxKind.Trivia
            && token !== SyntaxKind.BlockCommentTrivia
            && token !== SyntaxKind.LineCommentTrivia
            && token !== SyntaxKind.ColonToken
            && token !== SyntaxKind.NumericLiteral) {
                console.log('*** After Changes ***')
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
            const length = property.endLineNumber! - property.beginningLineNumber! + 1;
            sortedArrayOfLines.splice(beginningLineNumber, length);
            sortedArrayOfLines.splice(beginningLineNumber, 0, ...jsonContentToReplace);
            console.log('sortedArrayOfLines : ', sortedArrayOfLines)

            if(property.childrenProperties.length > 1 && property.type === Container.Object) {
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
            } else if (property.childrenProperties.length > 0 && property.type === Container.Array) {
                console.log('In the case when we have an array with subobjects');

                for(const subObject of property.childrenProperties) {

                    let minimumBeginningLineNumber = Infinity;
                    for(const childProperty of subObject.childrenProperties) {
                        if(childProperty.beginningLineNumber! < minimumBeginningLineNumber) {
                            minimumBeginningLineNumber = childProperty.beginningLineNumber!;
                        }
                    }
                    console.log('minimumBeginningLineNumber : ', minimumBeginningLineNumber)
                    const diff = minimumBeginningLineNumber - subObject.beginningLineNumber!;
                    console.log('diff : ', diff)
                    console.log('subObject.beginningLineNumber : ', subObject.beginningLineNumber)
                    console.log('subObject.childrenProperties : ', subObject.childrenProperties)
                    // Beginning line number should be one plus the position of the opening brace after transformation
                    // Relative brace position will be the same wihin array, brace will be at: subObject.beginningLineNumber - property.beginningLineNumber + 1, away from the position of the [ after transformation
                    // Total : beginningLineNumber + subObject.beginningLineNumber - property.beginningLineNumber + 1
                    queueToSort.push({'beginningLineNumber' : beginningLineNumber + subObject.beginningLineNumber! - property.beginningLineNumber! + 1, 'propertyArray' : subObject.childrenProperties})
                }
            }

            beginningLineNumber = beginningLineNumber + length;
        }
    }
    return sortedArrayOfLines;
}


  