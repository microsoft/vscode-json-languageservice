/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var gulp = require('gulp');
var tsb = require('gulp-tsb');
var assign = require('object-assign');
var rimraf = require('rimraf');
var merge = require('merge-stream');
var path = require('path');
var uri = require('vscode-uri').default;

var options = require('./src/tsconfig.json').compilerOptions;
var outDir = './lib';

// set sourceRoot to an absolute location to workaround https://github.com/jrieken/gulp-tsb/issues/48
var sourceRoot = uri.file(path.join(__dirname, 'src')).toString(); 

var compilation = tsb.create(assign({ verbose: true, sourceRoot: sourceRoot }, options));
var tsSources = './src/**/*.ts';

function compileTask() {
	return merge(
		gulp.src(tsSources).pipe(compilation())
	)
	.pipe(gulp.dest(outDir));
}

function toFileUri(filePath) {
	return uri.file(filePath).toString();
}

gulp.task('clean-out', function(cb) { rimraf(outDir, { maxBusyTries: 1 }, cb); });
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