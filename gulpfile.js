'use strict';

var gulp     = require('gulp'),
	mocha    = require('gulp-mocha'),
	plumber  = require('gulp-plumber'),
	jshint   = require('gulp-jshint'),
	jsonlint = require('gulp-jsonlint');

var paths = {
	js: ['*.js', '*/*.js', '*/**/*.js', '!node_modules/**'],
	json: ['*.json', '*/*.json', '*/**/*.json', '!node_modules/**'],
	tests: ['./test/*.js']
};

gulp.task('jslint', function () {
	return gulp.src(paths.js)
		.pipe(plumber())
		.pipe(jshint())
		.pipe(jshint.reporter('default'))
		.pipe(jshint.reporter('fail'));
});

gulp.task('jsonlint', function () {
	return gulp.src(paths.json)
		.pipe(plumber())
		.pipe(jsonlint())
		.pipe(jsonlint.reporter())
		.pipe(jsonlint.failOnError());
});

gulp.task('run-tests', function () {
	return gulp
		.src(paths.tests, {
			read: false
		})
		.pipe(mocha({
			reporter: 'list'
		}))
		.once('error', function (error) {
			console.error(error);
			process.exit(1);
		})
		.once('end', function () {
			process.exit();
		});
});

gulp.task('lint', ['jslint', 'jsonlint']);
gulp.task('test', ['lint', 'run-tests']);