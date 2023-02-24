/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

export enum Container {
    Object,
    Array
}

export class PropertyTree {
    propertyName: string;
    beginningLineNumber: number | undefined;
    endLineNumber: number | undefined;
    parent: PropertyTree | undefined;
    commaIndex: number | undefined;
    commaLine: number | undefined;
    lineWhereToAddComma: number | undefined;
    indexWhereToAddComa: number | undefined;
    type: Container | undefined;
    childrenProperties: PropertyTree[];
    lastProperty: boolean;
    noKeyName: boolean;

    constructor(
        propertyName?: string,
        beginningLineNumber?: number
    ) {

        this.propertyName = propertyName ?? '';
        this.beginningLineNumber = beginningLineNumber;
        this.childrenProperties = [];
        this.lastProperty = false;
        this.noKeyName = false;
    }

    addChildProperty(childProperty: PropertyTree): PropertyTree {

        childProperty.parent = this;
        if (this.childrenProperties.length > 0) {

            let insertionIndex = 0;
            if (childProperty.noKeyName) {
                insertionIndex = this.childrenProperties.length;
            } else {
                insertionIndex = binarySearchOnPropertyArray(this.childrenProperties, childProperty, compareProperties);
            }
            if (insertionIndex < 0) {
                insertionIndex = (insertionIndex * -1) - 1;
            }
            this.childrenProperties.splice(insertionIndex, 0, childProperty);
        } else {
            this.childrenProperties.push(childProperty);
        }
        return childProperty;
    }
}

function compareProperties(propertyTree1: PropertyTree, propertyTree2: PropertyTree) {
    const propertyName1 = propertyTree1.propertyName.toLowerCase();
    const propertyName2 = propertyTree2.propertyName.toLowerCase();
    if (propertyName1 < propertyName2) {
        return -1;
    } else if (propertyName1 > propertyName2) {
        return 1;
    }
    return 0;
}

function binarySearchOnPropertyArray(propertyTreeArray: PropertyTree[], propertyTree: PropertyTree, compare_fn: (p1: PropertyTree, p2: PropertyTree) => number) {
    if (propertyTree.propertyName < propertyTreeArray[0].propertyName) {
        return 0;
    }
    if (propertyTree.propertyName > propertyTreeArray[propertyTreeArray.length - 1].propertyName) {
        return propertyTreeArray.length;
    }
    let m = 0;
    let n = propertyTreeArray.length - 1;
    while (m <= n) {
        let k = (n + m) >> 1;
        let cmp = compare_fn(propertyTree, propertyTreeArray[k]);
        if (cmp > 0) {
            m = k + 1;
        } else if (cmp < 0) {
            n = k - 1;
        } else {
            return k;
        }
    }
    return -m - 1;
}