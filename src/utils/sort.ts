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
        keepLines: false, // keepLines must be false so that the properties are on separate lines for the sorting
        eol: '\n'
    };
    let formattedJSONString: string = TextDocument.applyEdits(documentToSort, format(documentToSort, options, undefined));
    const arrayOfLines: string[] = formattedJSONString.split('\n');
    const propertyTree : PropertyTree = findPropertyTree(formattedJSONString);
    const sortedArrayOfLines = sortLinesOfArray(arrayOfLines, propertyTree);
    const sortedDocument: TextDocument = TextDocument.create('test://test.json', 'json', 0, sortedArrayOfLines.join('\n'));
    const edits: TextEdit[] = format(sortedDocument, options, undefined);
    return TextDocument.applyEdits(sortedDocument, edits);
}

function findPropertyTree(formattedString : string) {

    const scanner : JSONScanner = createScanner(formattedString, false);
    // The tree that will be returned
    let rootTree : PropertyTree = new PropertyTree();
    // The tree where the properties can be added as children
    let currentTree : PropertyTree | undefined = rootTree;
    // The tree representing the current property analyzed
    let currentProperty : PropertyTree | undefined = rootTree;
    // The last tree representing the previous property analyzed
    let lastProperty : PropertyTree | undefined = rootTree;
    // The current scanned token
    let token : SyntaxKind | undefined = undefined;

    // The last token scanned that is not trivial, nor a comment
    let lastNonTriviaNonCommentToken : SyntaxKind | undefined = undefined;
    // The second to last token scanned that is not trivial, nor a comment
    let secondToLastNonTriviaNonCommentToken : SyntaxKind | undefined = undefined;

    // Line number of last token that is not trivial, nor a comment
    let lineOfLastNonTriviaNonCommentToken : number = -1;
    // Index on its line of last token that is not trivial, nor a comment
    let indexOfLastNonTriviaNonCommentToken : number = -1;

    // Line number of the start of the range of current/next property
    let beginningLineNumber : number = 0; // startLine;
    // Line number of the end of the range of current/next property
    let endLineNumber : number = 0; // startLine;

    // Stack indicating whether we are inside of an object or an array
    let currentContainerStack : Container[] = []
    // Total number of characters on the lines prior to current line 
    let numberOfCharactersOnPreviousLines : number = 0;
    // Temporary number of characters on current line 
    let tempNumberOfCharacters : number = 0;

    // Boolean indicating that the current property end line number needs to be updated. Used only when block comments are encountered.
    let updateLastPropertyEndLineNumber : boolean = false;
    // Boolean indicating that the beginning line number should be updated. Used only when block comments are encountered. 
    let updateBeginningLineNumber : boolean = false;

    while ((token = scanner.scan()) !== SyntaxKind.EOF) {

        // In the case when a block comment has been encountered that starts on the same line as the comma of a property, update the end line of that
        // property so that it covers the block comment. For example, if we have: 
        // 1. "key" : {}, /* some block
        // 2. comment */
        // Then, the end of the property "key" should be line 2 not line 1
        if (updateLastPropertyEndLineNumber === true 
            && token !== SyntaxKind.LineBreakTrivia 
            && token !== SyntaxKind.Trivia 
            && token !== SyntaxKind.LineCommentTrivia
            && token != SyntaxKind.BlockCommentTrivia 
            && currentProperty!.endLineNumber === undefined) {
            
            let endLineNumber = scanner.getTokenStartLine();
            // Update the end line when the last property visited was a container (object or array)
            if (secondToLastNonTriviaNonCommentToken === SyntaxKind.CloseBraceToken || secondToLastNonTriviaNonCommentToken === SyntaxKind.CloseBracketToken) {
                lastProperty!.endLineNumber = endLineNumber - 1;
            } 
            // Update the end line when the last property visited was a simple property
            else {
                currentProperty!.endLineNumber = endLineNumber - 1;
            }
            beginningLineNumber = endLineNumber;
            updateLastPropertyEndLineNumber = false;
        }

        // When block comment follows an open brace or an open bracket, that block comment should be associated to that brace or bracket, not the property below it. For example, for:
        // 1. { /*
        // 2. ... */
        // 3. "key" : {}
        // 4. }
        // Instead of associating the block comment to the property on line 3, it is associate to the property on line 1
        if (updateBeginningLineNumber === true
            && token !== SyntaxKind.LineBreakTrivia 
            && token !== SyntaxKind.Trivia
            && token !== SyntaxKind.LineCommentTrivia
            && token != SyntaxKind.BlockCommentTrivia ) {
                beginningLineNumber = scanner.getTokenStartLine();
                updateBeginningLineNumber = false;
        }

        switch(token) {

            // When a string is found, if it follows an open brace or a comma token and it is within an object, then it corresponds to a key name, not a simple string
            case SyntaxKind.StringLiteral: {
                if ((lastNonTriviaNonCommentToken === undefined 
                    || lastNonTriviaNonCommentToken === SyntaxKind.OpenBraceToken 
                    || (lastNonTriviaNonCommentToken === SyntaxKind.CommaToken 
                        && currentContainerStack[currentContainerStack.length - 1] === Container.Object))) {

                        // In that case create the childProperty which starts at beginningLineNumber a
                        const childProperty : PropertyTree = new PropertyTree(scanner.getTokenValue(), beginningLineNumber);
                        lastProperty = currentProperty;
                        currentProperty = currentTree!.addChildProperty(childProperty);
                }
                break;
            }
            
            // When the token is an open bracket, then we enter into an array
            case SyntaxKind.OpenBracketToken: {

                if(rootTree.beginningLineNumber === undefined) {
                    rootTree.beginningLineNumber = scanner.getTokenStartLine();
                }

                beginningLineNumber = scanner.getTokenStartLine();

                // We can also have the case of an array inside of an array, it should also be unnamed in that case
                // This happens when we are inside of an array in that case the current property has not been set yet
                if (currentContainerStack[currentContainerStack.length - 1] === Container.Object ) {
                    console.log('Inside top if')
                    currentTree = currentProperty;
                } 
                // Otherwise this property has not yet been created and needs to be created
                else if (currentContainerStack[currentContainerStack.length - 1] === Container.Array) {
                    // The object found has no associated key, it is of the form: ["a", [...], "b"]
                    console.log('noKeyName case')
                    let childProperty : PropertyTree = new PropertyTree(scanner.getTokenValue(), beginningLineNumber);
                    // In this case set the noKeyName propery to true
                    childProperty.noKeyName = true;
                    lastProperty = currentProperty;
                    currentProperty = currentTree!.addChildProperty(childProperty);
                }

                currentContainerStack.push(Container.Array)
                currentProperty!.type = Container.Array;
                // Enter into the array
                currentTree = currentProperty;
                beginningLineNumber++;
                break;
            }
            
            // When the token is an open brace
            case SyntaxKind.OpenBraceToken: {

                if(rootTree.beginningLineNumber === undefined) {
                    rootTree.beginningLineNumber = scanner.getTokenStartLine();
                }
                
                // If the open brace is inside of an array, all the comments preceeding it and before the last comma should be associated to the object
                if(currentContainerStack[currentContainerStack.length - 1] !== Container.Array) {
                    beginningLineNumber = scanner.getTokenStartLine();
                }

                // The currentProperty has already been created but now we enter into it
                if (currentContainerStack[currentContainerStack.length - 1] === Container.Object ) { // || currentProperty!.childrenProperties.length === 0
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
                    lastProperty = currentProperty;
                    currentProperty = currentTree!.addChildProperty(childProperty);
                }

                // In the case when we are inside of the array, then update the beginning line number since it was not done before
                if(currentContainerStack[currentContainerStack.length - 1] === Container.Array) {
                    beginningLineNumber = scanner.getTokenStartLine();
                }

                currentProperty!.type = Container.Object;
                currentContainerStack.push(Container.Object);
                // Enter into the object
                currentTree = currentProperty;
                beginningLineNumber++;
                break;
            }
            case SyntaxKind.CloseBracketToken: {
                console.log('Before change in close bracket token')
                console.log('currentContainerStack : ', currentContainerStack)
                console.log('currentTree : ', currentTree)
                console.log('currentProperty : ', currentProperty)
                
                endLineNumber = scanner.getTokenStartLine();
                currentContainerStack.pop();

                // If the last non-trivial non-comment token is an object or an array, then the currentProperty end line number has not been set yet, set it
                // Otherwise it has been set, and furthermore currentProperty and currentTree are at the same level
                if (lastNonTriviaNonCommentToken === SyntaxKind.CloseBraceToken || lastNonTriviaNonCommentToken === SyntaxKind.CloseBracketToken) {
                    currentProperty!.endLineNumber = endLineNumber - 1;

                    // Also set the data for comma slicing
                    // But if noKeyName is true, then no need to know if last property, because noKeyName objects are not displaced
                    // if (currentProperty!.noKeyName===false) {
                    currentProperty!.lastProperty = true;
                    currentProperty!.lineWhereToAddComma = lineOfLastNonTriviaNonCommentToken;
                    currentProperty!.indexWhereToAddComa = indexOfLastNonTriviaNonCommentToken;
                    // }

                    currentProperty = currentProperty ? currentProperty.parent : undefined;
                    currentTree = currentProperty;
                }

                rootTree.endLineNumber = scanner.getTokenStartLine();
                beginningLineNumber = endLineNumber + 1;
                break;
            }
            case SyntaxKind.CloseBraceToken: {
                console.log('Before change in close brace token')
                console.log('currentContainerStack : ', currentContainerStack)
                console.log('currentTree : ', currentTree)
                console.log('currentProperty : ', currentProperty)

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
                    
                    lastProperty = currentProperty;
                    currentProperty = currentProperty ? currentProperty.parent : undefined;
                    currentTree = currentProperty;
                }

                // Updating the last line of the rootTree
                rootTree.endLineNumber = scanner.getTokenStartLine();
                beginningLineNumber = endLineNumber + 1;
                break;
            }

            case SyntaxKind.CommaToken: {
                
                console.log('Before change in comma token')
                console.log('currentContainerStack : ', currentContainerStack)
                console.log('currentTree : ', currentTree)
                console.log('currentProperty : ', currentProperty)

                endLineNumber = scanner.getTokenStartLine();

                // If the last container is an object, or it is an array such that the last non trivia non-comment token is a brace, update hthe end line number of the current property
                if (currentProperty!.endLineNumber === undefined 
                    && (currentContainerStack[currentContainerStack.length - 1] === Container.Object 
                        || (currentContainerStack[currentContainerStack.length - 1] === Container.Array 
                            && (lastNonTriviaNonCommentToken === SyntaxKind.CloseBraceToken 
                            || lastNonTriviaNonCommentToken === SyntaxKind.CloseBracketToken)))) {
                    
                    console.log('Entered into the first if')
                    currentProperty!.endLineNumber = endLineNumber;
                    // Store the line and the index of the comma in case it needs to be removed during the sorting
                    currentProperty!.commaIndex =  scanner.getTokenOffset() - numberOfCharactersOnPreviousLines - 1;
                    currentProperty!.commaLine = endLineNumber;
                }

                if (lastNonTriviaNonCommentToken === SyntaxKind.CloseBraceToken || lastNonTriviaNonCommentToken === SyntaxKind.CloseBracketToken) {
                    console.log('Entered into the second if')
                    lastProperty = currentProperty;
                    currentProperty = currentProperty ? currentProperty.parent : undefined;
                    currentTree = currentProperty;
                }

                beginningLineNumber = endLineNumber + 1;
                break;
            }

            case SyntaxKind.BlockCommentTrivia: {
                
                // If the last non trivia non-comment token is a comma and the block comment starts on the same line as the comma, then update the end line number
                console.log('lastNonTriviaNonCommentToken : ', lastNonTriviaNonCommentToken)
                console.log('lineOfLastNonTriviaNonCommentToken : ', lineOfLastNonTriviaNonCommentToken)
                if(lastNonTriviaNonCommentToken === SyntaxKind.CommaToken 
                    && lineOfLastNonTriviaNonCommentToken === scanner.getTokenStartLine()) {
                        console.log('Entered into the first if loop')
                        currentProperty!.endLineNumber = undefined;
                        updateLastPropertyEndLineNumber = true;
                }

                // In this case we have the following scenario, in which case the block comment should be assigned to the open brace not the first property below it
                // { /**
                // ../
                // }
                if ((lastNonTriviaNonCommentToken === SyntaxKind.OpenBraceToken 
                    || lastNonTriviaNonCommentToken === SyntaxKind.OpenBracketToken) 
                    && lineOfLastNonTriviaNonCommentToken === scanner.getTokenStartLine()) {
                    console.log('Entered into the second if condition')
                    updateBeginningLineNumber = true;
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
                
                secondToLastNonTriviaNonCommentToken = lastNonTriviaNonCommentToken;
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
            }
        
        console.log('beginningLineNumber : ', beginningLineNumber)
        console.log('\n')
    }
    return rootTree;
}

function sortLinesOfArray(arrayOfLines : string[], propertyTree: PropertyTree) {

    console.log('\n')
    console.log('***')
    console.log('sortLinesOfArray')
    console.log('***')
    if (propertyTree.childrenProperties.length <= 1) {
        return arrayOfLines;
    }
    
    const sortedArrayOfLines = Object.assign([], arrayOfLines);
    const queueToSort = []

    let beginningLineNumber = propertyTree.beginningLineNumber!;

    if (propertyTree.type === Container.Object) {
        let minimumBeginningLineNumber = Infinity;
        for(const childProperty of propertyTree.childrenProperties) {
            if(childProperty.beginningLineNumber! < minimumBeginningLineNumber) {
                minimumBeginningLineNumber = childProperty.beginningLineNumber!;
            }
        }
        const diff = minimumBeginningLineNumber - propertyTree.beginningLineNumber!;
        beginningLineNumber = beginningLineNumber + diff
        queueToSort.push({'beginningLineNumber' : beginningLineNumber, 'propertyArray': propertyTree.childrenProperties})

    } else if (propertyTree.type === Container.Array) {
        for(const subObject of propertyTree.childrenProperties) {
            let minimumBeginningLineNumber = Infinity;
            for(const childProperty of subObject.childrenProperties) {
                if(childProperty.beginningLineNumber! < minimumBeginningLineNumber) {
                    minimumBeginningLineNumber = childProperty.beginningLineNumber!;
                }
            }
            const diff = minimumBeginningLineNumber - subObject.beginningLineNumber!;
            queueToSort.push({'beginningLineNumber' : beginningLineNumber + subObject.beginningLineNumber! - propertyTree.beginningLineNumber! + diff, 'propertyArray' : subObject.childrenProperties})
        }
    }

    while (queueToSort.length > 0) {

        const dataToSort = queueToSort.shift()
        const propertyArray : PropertyTree[] = dataToSort!['propertyArray'];
        console.log('\n')
        console.log('propertyArray : ', propertyArray)
        beginningLineNumber = dataToSort!['beginningLineNumber']
        console.log('beginningLineNumber : ', beginningLineNumber);

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
            console.log('beginningLineNumber : ', beginningLineNumber)
            const length = property.endLineNumber! - property.beginningLineNumber! + 1;
            sortedArrayOfLines.splice(beginningLineNumber, length);
            sortedArrayOfLines.splice(beginningLineNumber, 0, ...jsonContentToReplace);
            console.log('sortedArrayOfLines : ', sortedArrayOfLines)

            // used to be property.childrenProperties.length > 1
            if(property.childrenProperties.length > 0 && property.type === Container.Object) {
                let minimumBeginningLineNumber = Infinity;
                for(const childProperty of property.childrenProperties) {
                    if(childProperty.beginningLineNumber! < minimumBeginningLineNumber) {
                        minimumBeginningLineNumber = childProperty.beginningLineNumber!;
                    }
                }
                // console.log('minimumBeginningLineNumber : ', minimumBeginningLineNumber)
                const diff = minimumBeginningLineNumber - property.beginningLineNumber!;
                // if (property.offsetStartInnerRange) {
                //    beginningLineNumber += property.offsetStartInnerRange;
                //    console.log('beginningLineNumber when offset added : ', beginningLineNumber)
                // }
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
                    // if (subObject.offsetStartInnerRange) {
                    //    beginningLineNumber += subObject.offsetStartInnerRange;
                    // }
                    queueToSort.push({'beginningLineNumber' : beginningLineNumber + subObject.beginningLineNumber! - property.beginningLineNumber! + diff, 'propertyArray' : subObject.childrenProperties})
                }
            }

            beginningLineNumber = beginningLineNumber + length;
        }
    }
    return sortedArrayOfLines;
}


  