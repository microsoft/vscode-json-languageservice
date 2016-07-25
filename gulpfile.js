/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var gulp = require('gulp');
var tsb = require('gulp-tsb');
var assign = require('object-assign');
var rimraf = require('rimraf');
var merge = require('merge-stream');

var compilation = tsb.create(assign({ verbose: true }, require('./src/tsconfig.json').compilerOptions));
var tsSources = 'src/**/*.ts';

var outFolder = 'lib';

function compileTask() {
	return merge(
		gulp.src(tsSources).pipe(compilation())
	)
	.pipe(gulp.dest(outFolder));
}

gulp.task('clean-out', function(cb) { rimraf(outFolder, { maxBusyTries: 1 }, cb); });
gulp.task('compile', ['clean-out'], compileTask);
gulp.task('compile-without-clean', compileTask);
gulp.task('watch', ['compile'], function() {
	gulp.watch(tsSources, ['compile-without-clean']);
});


var vscodeJSONLibFolder = '../vscode/extensions/json/server/node_modules/vscode-json-languageservice/lib';

gulp.task('clean-vscode-json', function(cb) { rimraf(vscodeJSONLibFolder, { maxBusyTries: 1 }, cb); });
gulp.task('compile-vscode-json', ['clean-out', 'clean-vscode-json', 'compile-vscode-json-without-clean']);
gulp.task('compile-vscode-json-without-clean', function() {
	return compileTask().pipe(gulp.dest(vscodeJSONLibFolder));
});
gulp.task('watch-vscode-json', ['compile-vscode-json'], function() {
	gulp.watch(tsSources, ['compile-vscode-json-without-clean']);
});