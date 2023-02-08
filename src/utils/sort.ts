import { TextEdit} from 'vscode-languageserver-textdocument';
import { createScanner, SyntaxKind, JSONScanner } from 'jsonc-parser';
import { TextDocument, FormattingOptions } from '../jsonLanguageTypes';
import { format } from './format';
import { json } from 'node:stream/consumers';

export function sort(documentToSort: TextDocument, formattingOptions: FormattingOptions): string {
    const options = { 
        tabSize: formattingOptions.tabSize ? formattingOptions.tabSize : 4,
        insertFinalNewline: formattingOptions.insertFinalNewline === true,
        insertSpaces: true, 
        keepLines: false,
        eol: '\n'
    };
    let formattedJSONString: string = TextDocument.applyEdits(documentToSort, format(documentToSort, options, undefined));
    let arrayOfLines: string[] = formattedJSONString.split('\n');
    let sortingRange : number[] = findSortingRange(arrayOfLines);
    let propertyTree = findPropertyTree(formattedJSONString, sortingRange[0])
    sortingRange[0]++;
    sortingRange[1]--;
    let sortedArrayOfLines = sortLinesOfArray(arrayOfLines, propertyTree, sortingRange);
    let sortedDocument: TextDocument = TextDocument.create('test://test.json', 'json', 0, sortedArrayOfLines.join('\n'));
    let edits: TextEdit[] = format(sortedDocument, options, undefined);
    return TextDocument.applyEdits(sortedDocument, edits);
}

function findSortingRange(arrayOfLines: string[]): number[] {
    let beginningLineRange: number = 0;
    let endLineRange: number = 0;
    let range: number[] = [];
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

class PropertyTree {
    propertyName: any;
    beginningLineNumber: number | undefined;
    endLineNumber: number | undefined;
    childrenProperties: PropertyTree[];
    parent : PropertyTree | undefined;
    lastProperty : boolean;
    commaIndex  : number | undefined;

    constructor(
        propertyName?: any, 
        beginningLineNumber?: number, 
        endLineNumber?: number, 
        lastProperty? : boolean, 
        commaIndex? : number) {

        this.propertyName = propertyName;
        this.beginningLineNumber = beginningLineNumber ;
        this.endLineNumber = endLineNumber;
        this.childrenProperties = [];
        this.lastProperty = lastProperty ? lastProperty : false;
        this.commaIndex = commaIndex;
    }

    addChildProperty(
        propertyName? : string, 
        beginningLineNumber? : number, 
        endLineNumber? : number, 
        lastProperty? : boolean, 
        commaIndex? : number) : PropertyTree {

        let childProperty : PropertyTree = new PropertyTree(propertyName, beginningLineNumber, endLineNumber, lastProperty, commaIndex)
        childProperty.parent = this;
        if(this.childrenProperties.length > 0) {
            console.log('binarySearch : ', binarySearchOnPropertyArray(this.childrenProperties, childProperty, compareProperties))
            let insertionIndex = binarySearchOnPropertyArray(this.childrenProperties, childProperty, compareProperties)
            if(insertionIndex < 0) {
                insertionIndex = (insertionIndex * -1) - 1
            }
            this.childrenProperties.splice(insertionIndex, 0, childProperty)
        } else {
            this.childrenProperties.push(childProperty)
        }
        return childProperty;
    }
}

enum Container {
    Object, 
    Array
}

function findPropertyTree(formattedString : string, startLine : number) {
    console.log('formatted string', formattedString);
    const scanner : JSONScanner = createScanner(formattedString, false);
    let rootTree : PropertyTree = new PropertyTree();
    let currentTree : PropertyTree | undefined = rootTree;
    let currentProperty : PropertyTree | undefined = rootTree;
    let token : SyntaxKind | undefined = undefined;
    let lastNonTriviaNonCommentToken : SyntaxKind | undefined = undefined;
    let beginningLineNumber : number = startLine;
    let currentContainerStack : Container[] = []
    let numberOfCharactersOnPreviousLines : number = 0;
    let tempNumberOfCharacters = 0;

    while ((token = scanner.scan()) !== SyntaxKind.EOF) {

        /*
        export const enum SyntaxKind {
            OpenBraceToken = 1,
            CloseBraceToken = 2,
            OpenBracketToken = 3,
            CloseBracketToken = 4,
            CommaToken = 5,
            ColonToken = 6,
            NullKeyword = 7,
            TrueKeyword = 8,
            FalseKeyword = 9,
            StringLiteral = 10,
            NumericLiteral = 11,
            LineCommentTrivia = 12,
            BlockCommentTrivia = 13,
            LineBreakTrivia = 14,
            Trivia = 15,
            Unknown = 16,
            EOF = 17
        }
        */
        console.log('\n')
        console.log('***')
        console.log('lastNonTriviaToken : ', lastNonTriviaNonCommentToken)
        switch(token) { 
            
            case SyntaxKind.StringLiteral: {
                console.log('Entered into string literal')
                if ((lastNonTriviaNonCommentToken === undefined || lastNonTriviaNonCommentToken === SyntaxKind.OpenBraceToken || 
                    (lastNonTriviaNonCommentToken === SyntaxKind.CommaToken && 
                    currentContainerStack[currentContainerStack.length - 1] === Container.Object))
                    && currentTree) {
                        let propertyName = scanner.getTokenValue();
                        currentProperty = currentTree.addChildProperty(propertyName, beginningLineNumber);
                }
                lastNonTriviaNonCommentToken = SyntaxKind.StringLiteral;
                break;
            }
            case SyntaxKind.OpenBracketToken: {
                console.log('Entered into open bracket token')
                currentContainerStack.push(Container.Array)
                lastNonTriviaNonCommentToken = SyntaxKind.OpenBracketToken;
                break;
            }
            case SyntaxKind.OpenBraceToken: {
                console.log('Entered into open brace token')
                currentContainerStack.push(Container.Object)
                currentTree = currentProperty;
                lastNonTriviaNonCommentToken = SyntaxKind.OpenBraceToken;
                beginningLineNumber++;
                break;
            }
            case SyntaxKind.CloseBracketToken: {
                console.log('Entered into close brace token')
                currentContainerStack.pop();
                lastNonTriviaNonCommentToken = SyntaxKind.CloseBracketToken;
                break;
            }
            case SyntaxKind.CloseBraceToken: { 
                console.log('Entered into close brace token')
                currentContainerStack.pop();
                currentTree = currentTree? currentTree.parent : undefined;
                let endLineNumber = scanner.getTokenStartLine();
                beginningLineNumber = endLineNumber + 1;
                if(lastNonTriviaNonCommentToken !== SyntaxKind.OpenBraceToken && currentProperty) {
                    currentProperty.endLineNumber = endLineNumber - 1;
                    currentProperty.lastProperty = true;
                }
                currentProperty = currentProperty ? currentProperty.parent : undefined;
                lastNonTriviaNonCommentToken = SyntaxKind.CloseBraceToken;
                break;
            }
            case SyntaxKind.CommaToken: {
                console.log('Entered into comma token')
                let endLineNumber = scanner.getTokenStartLine();
                if (currentContainerStack[currentContainerStack.length - 1] === Container.Object && currentProperty) {
                    currentProperty.endLineNumber = endLineNumber;
                    currentProperty.commaIndex = scanner.getTokenOffset() - numberOfCharactersOnPreviousLines - 1;
                    
                }
                beginningLineNumber = endLineNumber + 1;
                lastNonTriviaNonCommentToken = SyntaxKind.CommaToken;
                break;
            }
            case SyntaxKind.ColonToken:
            case SyntaxKind.NullKeyword:
            case SyntaxKind.TrueKeyword:
            case SyntaxKind.FalseKeyword:
            case SyntaxKind.NumericLiteral: {
                console.log('Entered into other token ')
                lastNonTriviaNonCommentToken = token;
                break;
            }
            case SyntaxKind.LineBreakTrivia: {
                numberOfCharactersOnPreviousLines = numberOfCharactersOnPreviousLines + tempNumberOfCharacters;
                tempNumberOfCharacters = 0;
            }
        }

        tempNumberOfCharacters += scanner.getTokenLength();

        console.log('token : ', token)
        console.log('token from scanner : ', scanner.getToken())
        console.log('token.value : ', scanner.getTokenValue())
        console.log('currentContainerStack : ', currentContainerStack);
        console.log('currentTree : ', currentTree)
        console.log('curentProperty : ', currentProperty)
        console.log('beginningLineNumber : ', beginningLineNumber)
    }
    console.log('\n')
    console.log('root tree :', rootTree);
    return rootTree;
}

function sortLinesOfArray(arrayOfLines : string[], propertyTree: PropertyTree, sortingRange : number[]) {

    // console.log('arrayOfLines : ', arrayOfLines);
    // console.log('propertyTree : ', propertyTree);

    if (propertyTree.childrenProperties.length === 0) {
        return arrayOfLines;
    }
    
    let sortedArrayOfLines = Object.assign([], arrayOfLines);
    let queueToSort = []
    queueToSort.push({'sortingRange': sortingRange, 'beginningLineNumber' : sortingRange[0], 'propertyArray': propertyTree.childrenProperties})

    while (queueToSort.length > 0) {

        let dataToSort = queueToSort.shift()
        // console.log('dataToSort : ', dataToSort);
        let sortingRange : number[] = dataToSort!['sortingRange'];
        let propertyArray : PropertyTree[] = dataToSort!['propertyArray'];
        let beginningLineNumber : number = dataToSort!['beginningLineNumber']

        console.log('\n')
        console.log('propertyArray : ', propertyArray)
        console.log('sortingRange : ', sortingRange)
        
        for (let i = 0; i < propertyArray.length; i++) {

            let property = propertyArray[i]
            let jsonContentToReplace = arrayOfLines.slice(property.beginningLineNumber, property.endLineNumber! + 1);

            if (property.lastProperty === true && i !== propertyArray.length - 1) {
                // TODO, if there is a comment on that line, add comma before the comment?
                jsonContentToReplace[jsonContentToReplace.length - 1] = jsonContentToReplace[jsonContentToReplace.length - 1] + ',';
            } else if (property.lastProperty === false && i === propertyArray.length - 1) {
                let commaIndex = property.commaIndex;
                jsonContentToReplace[jsonContentToReplace.length - 1] = jsonContentToReplace[jsonContentToReplace.length - 1].slice(0, commaIndex) + jsonContentToReplace[jsonContentToReplace.length - 1].slice(commaIndex! + 1);
            }
            console.log('jsoncContentToReplace : ', jsonContentToReplace)

            // console.log('jsonContentToReplace : ', jsonContentToReplace);
            let length = property.endLineNumber! - property.beginningLineNumber! + 1;
            sortedArrayOfLines.splice(beginningLineNumber, length);
            sortedArrayOfLines.splice(beginningLineNumber, 0, ...jsonContentToReplace);
            console.log('sortedArrayOfLines : ', sortedArrayOfLines)
            console.log('beginningLineNumber : ', beginningLineNumber)
            if(property.childrenProperties.length > 0) {
                let childrenSortingRange : number[] = [property.beginningLineNumber! + 1, property.endLineNumber! - 1]
                let childrenProperties : PropertyTree[] = property.childrenProperties;
                queueToSort.push({'sortingRange' : childrenSortingRange, 'beginningLineNumber' : beginningLineNumber + 1, 'propertyArray' : childrenProperties})
            }
            beginningLineNumber = beginningLineNumber + length;
        }
    }

    return sortedArrayOfLines;
}

function compareProperties(property1 : PropertyTree, property2 : PropertyTree) {
    if ( property1.propertyName < property2.propertyName){
      return -1;
    } else if ( property1.propertyName > property2.propertyName ){
      return 1;
    }
    return 0;
}

function binarySearchOnPropertyArray(propertyArray : PropertyTree[], property : PropertyTree, compare_fn : (p1 : PropertyTree, p2: PropertyTree) => number) {
    if (property.propertyName < propertyArray[0].propertyName)
        return 0;
    if (property.propertyName > propertyArray[propertyArray.length-1].propertyName)
        return propertyArray.length;
    var m = 0;
    var n = propertyArray.length - 1;
    while (m <= n) {
        var k = (n + m) >> 1;
        var cmp = compare_fn(property, propertyArray[k]);
        if (cmp > 0) {
            m = k + 1;
        } else if(cmp < 0) {
            n = k - 1;
        } else {
            return k;
        }
    }
    return -m - 1;
}
  