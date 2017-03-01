'use strict'

let gulp = require('gulp')
let mocha = require('gulp-mocha')
let plumber = require('gulp-plumber')
let jshint = require('gulp-jshint')
let jsonlint = require('gulp-json-lint')
let standard = require('gulp-standard')

let paths = {
  js: ['*.js', '*/*.js', '*/**/*.js', '!node_modules/**'],
  json: ['*.json', '*/*.json', '*/**/*.json', '!node_modules/**'],
  tests: ['./test/*.js']
}

gulp.task('jslint', function () {
  return gulp.src(paths.js)
    .pipe(plumber())
    .pipe(jshint())
    .pipe(jshint.reporter('default'))
    .pipe(jshint.reporter('fail'))
})

gulp.task('jsonlint', function () {
  return gulp.src(paths.json)
    .pipe(plumber())
    .pipe(jsonlint({
      comments: true
    }))
    .pipe(jsonlint.report())
})

gulp.task('standard', function () {
  return gulp.src(['./app.js'])
    .pipe(standard())
    .pipe(standard.reporter('default', {
      breakOnError: true,
      quiet: true,
      showRuleNames: true,
      showFilePath: true
    }))
})

gulp.task('run-tests', function () {
  return gulp
    .src(paths.tests, {
      read: false
    })
    .pipe(mocha({
      reporter: 'list'
    }))
    .once('error', function (error) {
      console.error(error)
      process.exit(1)
    })
    .once('end', function () {
      process.exit()
    })
})

gulp.task('lint', ['jslint', 'jsonlint', 'standard'])
gulp.task('test', ['lint', 'run-tests'])
