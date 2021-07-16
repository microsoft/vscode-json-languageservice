/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { createRegex } from '../utils/glob';


suite('Glob', () => {
    test('Glob matching, where fileMatch is a wildcard pattern, contains no double-star, and denotes filename only', async function () {

        const pattern = '**/*.foo.json';

        const positives = ['file:///folder/a.foo.json'];
        const negatives = ['file:///folder/a.bar.json'];

        for (const positive of positives) {
            assertGlobMatch(pattern, positive);
        }

        for (const negative of negatives) {
            assertNoGlobMatch(pattern, negative);
        }
    });

    test('Glob matching, where fileMatch is a wildcard pattern, contains no double-star, and denotes a path', async function () {

        const pattern = '**/foo/*/bar.json';

        const positives = ['file:///folder/foo/bat/bar.json'];
        const negatives = ['file:///folder/a.bar.json', 'file:///folder/foo/bar.json', 'file:///folder/foo/can/be/as/deep/as/the/ocean/floor/bar.json', 'file:///folder/foo/bar.json/bat/bar.json', 'file:///folder/foo.bar.json', 'file:///folder/foo.bat/bar.json', 'file:///folder/foo/bar.json/bat.json', 'file:///folder/.foo/bar.json', 'file:///folder/.foo/bat/bar.json', 'file:///folder/.foo/bat/man/bar.json'];

        for (const positive of positives) {
            assertGlobMatch(pattern, positive);
        }

        for (const negative of negatives) {
            assertNoGlobMatch(pattern, negative);
        }
    });

    test('Glob matching, where fileMatch is a wildcard pattern, contains double-star, and denotes a path', async function () {

        const pattern = '**/foo/**/bar.json';

        const positives = ['file:///folder/foo/bar.json', 'file:///folder/foo/bat/bar.json', 'file:///folder/foo/can/be/as/deep/as/the/ocean/floor/bar.json', 'file:///folder/foo/bar.json/bat/bar.json'];
        const negatives = ['file:///folder/a.bar.json', 'file:///folder/foo.bar.json', 'file:///folder/foo.bat/bar.json', 'file:///folder/foo/bar.json/bat.json', 'file:///folder/.foo/bar.json', 'file:///folder/.foo/bat/bar.json', 'file:///folder/.foo/bat/man/bar.json', 'file:///folder/foo?foo/bat/man/bar.json'];
        for (const positive of positives) {
            assertGlobMatch(pattern, positive);
        }

        for (const negative of negatives) {
            assertNoGlobMatch(pattern, negative);
        }
    });

    function assertMatch(pattern: string, input: string, expected: boolean) {
        try {
            const regex = createRegex(pattern, { extended: true, globstar: true });
            const result = regex.test(input);
            if (result !== expected) {
                assert(false, `pattern: ${pattern}, regex: ${regex.source}, input: ${input}, should match ${expected}`);
            }
        } catch (e) {
            assert(false, `pattern: ${pattern}, input: ${input}, should match ${expected}`);
        }
    }

    function assertGlobMatch(pattern: string, input: string) {
        assertMatch(pattern, input, true);
    }

    function assertNoGlobMatch(pattern: string, input: string) {
        assertMatch(pattern, input, false);
    }

    test('simple', () => {
        let p = 'node_modules';

        assertGlobMatch(p, 'node_modules');
        assertNoGlobMatch(p, 'node_module');
        assertNoGlobMatch(p, '/node_modules');
        assertNoGlobMatch(p, 'test/node_modules');

        p = 'test.txt';
        assertGlobMatch(p, 'test.txt');
        assertNoGlobMatch(p, 'test?txt');
        assertNoGlobMatch(p, '/text.txt');
        assertNoGlobMatch(p, 'test/test.txt');

        p = 'test(.txt';
        assertGlobMatch(p, 'test(.txt');
        assertNoGlobMatch(p, 'test?txt');

        p = 'qunit';

        assertGlobMatch(p, 'qunit');
        assertNoGlobMatch(p, 'qunit.css');
        assertNoGlobMatch(p, 'test/qunit');

        // Absolute

        p = '/DNXConsoleApp/**/*.cs';
        assertGlobMatch(p, '/DNXConsoleApp/Program.cs');
        assertGlobMatch(p, '/DNXConsoleApp/foo/Program.cs');

        p = '*';
        assertGlobMatch(p, '');
    });

    test('dot hidden', function () {
        let p = '.*';

        assertGlobMatch(p, '.git');
        assertGlobMatch(p, '.hidden.txt');
        assertNoGlobMatch(p, 'git');
        assertNoGlobMatch(p, 'hidden.txt');
        assertNoGlobMatch(p, 'path/.git');
        assertNoGlobMatch(p, 'path/.hidden.txt');

        p = '**/.*';
        assertGlobMatch(p, '.git');
        assertGlobMatch(p, '.hidden.txt');
        assertNoGlobMatch(p, 'git');
        assertNoGlobMatch(p, 'hidden.txt');
        assertGlobMatch(p, 'path/.git');
        assertGlobMatch(p, 'path/.hidden.txt');
        assertNoGlobMatch(p, 'path/git');
        assertNoGlobMatch(p, 'pat.h/hidden.txt');

        p = '._*';

        assertGlobMatch(p, '._git');
        assertGlobMatch(p, '._hidden.txt');
        assertNoGlobMatch(p, 'git');
        assertNoGlobMatch(p, 'hidden.txt');
        assertNoGlobMatch(p, 'path/._git');
        assertNoGlobMatch(p, 'path/._hidden.txt');

        p = '**/._*';
        assertGlobMatch(p, '._git');
        assertGlobMatch(p, '._hidden.txt');
        assertNoGlobMatch(p, 'git');
        assertNoGlobMatch(p, 'hidden._txt');
        assertGlobMatch(p, 'path/._git');
        assertGlobMatch(p, 'path/._hidden.txt');
        assertNoGlobMatch(p, 'path/git');
        assertNoGlobMatch(p, 'pat.h/hidden._txt');
    });

    test('file pattern', function () {
        let p = '*.js';

        assertGlobMatch(p, 'foo.js');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');

        p = 'html.*';
        assertGlobMatch(p, 'html.js');
        assertGlobMatch(p, 'html.txt');
        assertNoGlobMatch(p, 'htm.txt');

        p = '*.*';
        assertGlobMatch(p, 'html.js');
        assertGlobMatch(p, 'html.txt');
        assertGlobMatch(p, 'htm.txt');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');

        p = 'node_modules/test/*.js';
        assertGlobMatch(p, 'node_modules/test/foo.js');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_module/test/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');
    });

    test('star', () => {
        let p = 'node*modules';

        assertGlobMatch(p, 'node_modules');
        assertGlobMatch(p, 'node_super_modules');
        assertNoGlobMatch(p, 'node_module');
        assertNoGlobMatch(p, '/node_modules');
        assertNoGlobMatch(p, 'test/node_modules');

        p = '*';
        assertGlobMatch(p, 'html.js');
        assertGlobMatch(p, 'html.txt');
        assertGlobMatch(p, 'htm.txt');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
    });

    test('file / folder match', function () {
        let p = '**/node_modules/**';

        assertGlobMatch(p, 'node_modules');
        assertGlobMatch(p, 'node_modules/');
        assertGlobMatch(p, 'a/node_modules');
        assertGlobMatch(p, 'a/node_modules/');
        assertGlobMatch(p, 'node_modules/foo');
        assertGlobMatch(p, 'foo/node_modules/foo/bar');
    });

    test('questionmark', () => {
        let p = 'node?modules';

        assertGlobMatch(p, 'node_modules');
        assertNoGlobMatch(p, 'node_super_modules');
        assertNoGlobMatch(p, 'node_module');
        assertNoGlobMatch(p, '/node_modules');
        assertNoGlobMatch(p, 'test/node_modules');

        p = '?';
        assertGlobMatch(p, 'h');
        assertNoGlobMatch(p, 'html.txt');
        assertNoGlobMatch(p, 'htm.txt');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
    });

    test('globstar', () => {
        let p = '**/*.js';

        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'folder/foo.js');
        assertGlobMatch(p, '/node_modules/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');
        assertNoGlobMatch(p, '/some.js/test');
        assertNoGlobMatch(p, '/some.js/test');

        p = '**/project.json';

        assertGlobMatch(p, 'project.json');
        assertGlobMatch(p, '/project.json');
        assertGlobMatch(p, 'some/folder/project.json');
        assertNoGlobMatch(p, 'some/folder/file_project.json');
        assertNoGlobMatch(p, 'some/folder/fileproject.json');
        assertNoGlobMatch(p, 'some/rrproject.json');

        p = 'test/**';
        assertGlobMatch(p, 'test');
        assertGlobMatch(p, 'test/foo.js');
        assertGlobMatch(p, 'test/other/foo.js');
        assertNoGlobMatch(p, 'est/other/foo.js');

        p = '**';
        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'folder/foo.js');
        assertGlobMatch(p, '/node_modules/foo.js');
        assertGlobMatch(p, 'foo.jss');
        assertGlobMatch(p, 'some.js/test');

        p = 'test/**/*.js';
        assertGlobMatch(p, 'test/foo.js');
        assertGlobMatch(p, 'test/other/foo.js');
        assertGlobMatch(p, 'test/other/more/foo.js');
        assertNoGlobMatch(p, 'test/foo.ts');
        assertNoGlobMatch(p, 'test/other/foo.ts');
        assertNoGlobMatch(p, 'test/other/more/foo.ts');

        p = '**/**/*.js';

        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'folder/foo.js');
        assertGlobMatch(p, '/node_modules/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');

        p = '**/node_modules/**/*.js';

        assertNoGlobMatch(p, 'foo.js');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertGlobMatch(p, 'node_modules/foo.js');
        assertGlobMatch(p, 'node_modules/some/folder/foo.js');
        assertNoGlobMatch(p, 'node_modules/some/folder/foo.ts');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');

        p = '{**/node_modules/**,**/.git/**,**/bower_components/**}';

        assertGlobMatch(p, 'node_modules');
        assertGlobMatch(p, '/node_modules');
        assertGlobMatch(p, '/node_modules/more');
        assertGlobMatch(p, 'some/test/node_modules');
        assertGlobMatch(p, 'some/test/node_modules');
        assertGlobMatch(p, 'C://some/test/node_modules');
        assertGlobMatch(p, 'C://some/test/node_modules/more');

        assertGlobMatch(p, 'bower_components');
        assertGlobMatch(p, 'bower_components/more');
        assertGlobMatch(p, '/bower_components');
        assertGlobMatch(p, 'some/test/bower_components');
        assertGlobMatch(p, 'some/test/bower_components');
        assertGlobMatch(p, 'C://some/test/bower_components');
        assertGlobMatch(p, 'C://some/test/bower_components/more');

        assertGlobMatch(p, '.git');
        assertGlobMatch(p, '/.git');
        assertGlobMatch(p, 'some/test/.git');
        assertGlobMatch(p, 'some/test/.git');
        assertGlobMatch(p, 'C://some/test/.git');

        assertNoGlobMatch(p, 'tempting');
        assertNoGlobMatch(p, '/tempting');
        assertNoGlobMatch(p, 'some/test/tempting');
        assertNoGlobMatch(p, 'some/test/tempting');
        assertNoGlobMatch(p, 'C://some/test/tempting');

        p = '{**/package.json,**/project.json}';
        assertGlobMatch(p, 'package.json');
        assertGlobMatch(p, '/package.json');
        assertNoGlobMatch(p, 'xpackage.json');
        assertNoGlobMatch(p, '/xpackage.json');
    });

    test('issue 41724', function () {
        let p = 'some/**/*.js';

        assertGlobMatch(p, 'some/foo.js');
        assertGlobMatch(p, 'some/folder/foo.js');
        assertNoGlobMatch(p, 'something/foo.js');
        assertNoGlobMatch(p, 'something/folder/foo.js');

        p = 'some/**/*';

        assertGlobMatch(p, 'some/foo.js');
        assertGlobMatch(p, 'some/folder/foo.js');
        assertNoGlobMatch(p, 'something/foo.js');
        assertNoGlobMatch(p, 'something/folder/foo.js');
    });

    test('brace expansion', function () {
        let p = '*.{html,js}';

        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'foo.html');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');

        p = '*.{html}';

        assertGlobMatch(p, 'foo.html');
        assertNoGlobMatch(p, 'foo.js');
        assertNoGlobMatch(p, 'folder/foo.js');
        assertNoGlobMatch(p, '/node_modules/foo.js');
        assertNoGlobMatch(p, 'foo.jss');
        assertNoGlobMatch(p, 'some.js/test');

        p = '{node_modules,testing}';
        assertGlobMatch(p, 'node_modules');
        assertGlobMatch(p, 'testing');
        assertNoGlobMatch(p, 'node_module');
        assertNoGlobMatch(p, 'dtesting');

        p = '**/{foo,bar}';
        assertGlobMatch(p, 'foo');
        assertGlobMatch(p, 'bar');
        assertGlobMatch(p, 'test/foo');
        assertGlobMatch(p, 'test/bar');
        assertGlobMatch(p, 'other/more/foo');
        assertGlobMatch(p, 'other/more/bar');

        p = '{foo,bar}/**';
        assertGlobMatch(p, 'foo');
        assertGlobMatch(p, 'bar');
        assertGlobMatch(p, 'foo/test');
        assertGlobMatch(p, 'bar/test');
        assertGlobMatch(p, 'foo/other/more');
        assertGlobMatch(p, 'bar/other/more');

        p = '{**/*.d.ts,**/*.js}';

        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'testing/foo.js');
        assertGlobMatch(p, 'testing/foo.js');
        assertGlobMatch(p, '/testing/foo.js');
        assertGlobMatch(p, '/testing/foo.js');
        assertGlobMatch(p, 'C:/testing/foo.js');

        assertGlobMatch(p, 'foo.d.ts');
        assertGlobMatch(p, 'testing/foo.d.ts');
        assertGlobMatch(p, 'testing/foo.d.ts');
        assertGlobMatch(p, '/testing/foo.d.ts');
        assertGlobMatch(p, '/testing/foo.d.ts');
        assertGlobMatch(p, 'C:/testing/foo.d.ts');

        assertNoGlobMatch(p, 'foo.d');
        assertNoGlobMatch(p, 'testing/foo.d');
        assertNoGlobMatch(p, 'testing/foo.d');
        assertNoGlobMatch(p, '/testing/foo.d');
        assertNoGlobMatch(p, '/testing/foo.d');
        assertNoGlobMatch(p, 'C:/testing/foo.d');

        p = '{**/*.d.ts,**/*.js,path/simple.jgs}';

        assertGlobMatch(p, 'foo.js');
        assertGlobMatch(p, 'testing/foo.js');
        assertGlobMatch(p, 'testing/foo.js');
        assertGlobMatch(p, '/testing/foo.js');
        assertGlobMatch(p, 'path/simple.jgs');
        assertNoGlobMatch(p, '/path/simple.jgs');
        assertGlobMatch(p, '/testing/foo.js');
        assertGlobMatch(p, 'C:/testing/foo.js');

        p = '{**/*.d.ts,**/*.js,foo.[0-9]}';

        assertGlobMatch(p, 'foo.5');
        assertGlobMatch(p, 'foo.8');
        assertNoGlobMatch(p, 'bar.5');
        assertNoGlobMatch(p, 'foo.f');
        assertGlobMatch(p, 'foo.js');

        p = 'prefix/{**/*.d.ts,**/*.js,foo.[0-9]}';

        assertGlobMatch(p, 'prefix/foo.5');
        assertGlobMatch(p, 'prefix/foo.8');
        assertNoGlobMatch(p, 'prefix/bar.5');
        assertNoGlobMatch(p, 'prefix/foo.f');
        assertGlobMatch(p, 'prefix/foo.js');
    });

});