/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

export enum Container {
    Object, 
    Array
}

export class PropertyTree {
    propertyName: any;
    beginningLineNumber: number | undefined;
    endLineNumber: number | undefined;
    childrenProperties: PropertyTree[];
    parent : PropertyTree | undefined;
    lastProperty : boolean;
    commaIndex  : number | undefined;
    commaLine : number | undefined;

    constructor(
        propertyName?: any, 
        beginningLineNumber?: number, 
        endLineNumber?: number, 
        lastProperty? : boolean, 
        commaIndex? : number, 
        commaLine?: number) {

        this.propertyName = propertyName;
        this.beginningLineNumber = beginningLineNumber ;
        this.endLineNumber = endLineNumber;
        this.childrenProperties = [];
        this.lastProperty = lastProperty ? lastProperty : false;
        this.commaIndex = commaIndex;
        this.commaLine = commaLine;
    }

    addChildProperty(
        propertyName? : string, 
        beginningLineNumber? : number, 
        endLineNumber? : number, 
        lastProperty? : boolean, 
        commaIndex? : number,
        commaLine? : number) : PropertyTree {

        let childProperty : PropertyTree = new PropertyTree(propertyName, beginningLineNumber, endLineNumber, lastProperty, commaIndex, commaLine)
        childProperty.parent = this;
        if(this.childrenProperties.length > 0) {
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