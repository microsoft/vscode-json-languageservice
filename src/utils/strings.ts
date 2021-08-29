/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/
import * as unicode_support from './unicode_support';
export function startsWith(haystack: string, needle: string): boolean {
	if (haystack.length < needle.length) {
		return false;
	}

	for (let i = 0; i < needle.length; i++) {
		if (haystack[i] !== needle[i]) {
			return false;
		}
	}

	return true;
}

/**
 * Determines if haystack ends with needle.
 */
export function endsWith(haystack: string, needle: string): boolean {
	const diff = haystack.length - needle.length;
	if (diff > 0) {
		return haystack.lastIndexOf(needle) === diff;
	} else if (diff === 0) {
		return haystack === needle;
	} else {
		return false;
	}
}

export function convertSimple2RegExpPattern(pattern: string): string {
	return pattern.replace(/[\-\\\{\}\+\?\|\^\$\.\,\[\]\(\)\#\s]/g, '\\$&').replace(/[\*]/g, '.*');
}

export function repeat(value: string, count: number) {
	var s = '';
	while (count > 0) {
		if ((count & 1) === 1) {
			s += value;
		}
		value += value;
		count = count >>> 1;
	}
	return s;
}

export function extendedRegExp(pattern: string): RegExp {
	if (startsWith(pattern, '(?i)')) {
		return new RegExp(pattern.substring(4), 'i');
	} else {
		return unicode_support.unicode_simplifier(pattern);
	}
}
