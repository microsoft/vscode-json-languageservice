/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {stringifyObject} from '../utils/json';
import * as assert from 'assert';

suite('JSON Stringify', () => {

	test('Object', function() {
		let obj = {
			key1: 'Hello',
			key2: true,
			key3: 1.3,
			key4: null,
			key5: { key1: '', key2: false }
		};
		assert.equal(stringifyObject(obj, '', JSON.stringify), '{\n\t"key1": "Hello",\n\t"key2": true,\n\t"key3": 1.3,\n\t"key4": null,\n\t"key5": {\n\t\t"key1": "",\n\t\t"key2": false\n\t}\n}');

	});

	test('Array', function() {
		let arr = [
			'Hello', {}, [ 1234 ], []
		];
		assert.equal(stringifyObject(arr, '', JSON.stringify), JSON.stringify(arr, null, '\t'));

	});  

});