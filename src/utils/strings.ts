/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

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
	let s = '';
	while (count > 0) {
		if ((count & 1) === 1) {
			s += value;
		}
		value += value;
		count = count >>> 1;
	}
	return s;
}

export function decodeUriFragment(fragment: string): string {
	try {
		return decodeURIComponent(fragment);
	} catch (error) {
		if (error instanceof URIError) {
			// Preserve literal malformed escapes for compatibility.
			return fragment;
		}
		throw error;
	}
}

const unreservedUriCharRegex = /^[A-Za-z0-9\-._~]$/;

/**
 * Normalizes the percent-encoding of a URI component (RFC 3986, section 6.2.2): escaped unreserved characters are
 * decoded and hex digits uppercased. Characters a URI can't contain, such as spaces or non-ASCII characters, are encoded.
 * Other escapes stay encoded, as decoding them can change the resource the URI addresses.
 */
export function normalizeUriEncoding(component: string): string {
	return component.replace(/%([0-9A-Fa-f]{2})|[^\x21-\x7E]/gu, (match: string, hex: string | undefined) => {
		if (hex !== undefined) {
			const char = String.fromCharCode(parseInt(hex, 16));
			return unreservedUriCharRegex.test(char) ? char : match.toUpperCase();
		}
		try {
			return encodeURIComponent(match);
		} catch (error) {
			if (error instanceof URIError) {
				// A lone surrogate has no UTF-8 encoding, keep it.
				return match;
			}
			throw error;
		}
	});
}

export function extendedRegExp(pattern: string): RegExp | undefined {
	let flags = '';
	if (startsWith(pattern, '(?i)')) {
		pattern = pattern.substring(4);
		flags = 'i';
	}
	try {
		return new RegExp(pattern, flags + 'u');
	} catch (e) {
		// could be an exception due to the 'u ' flag
		try {
			return new RegExp(pattern, flags);
		} catch (e) {
			// invalid pattern
			return undefined;
		}
	}
}

// from https://tanishiking.github.io/posts/count-unicode-codepoint/#work-hard-with-for-statements
export function stringLength(str: string) {
	let count = 0;
	for (let i = 0; i < str.length; i++) {
		count++;
		// obtain the i-th 16-bit
		const code = str.charCodeAt(i);
		if (0xD800 <= code && code <= 0xDBFF) {
			// if the i-th 16bit is an upper surrogate
			// skip the next 16 bits (lower surrogate)
			i++;
		}
	}
	return count;
}