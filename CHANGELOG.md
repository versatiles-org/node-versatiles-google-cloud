# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-02-15

### Bug Fixes

- update badge links in README for NPM version, downloads, code coverage, CI status, and license

### Chores

- update dependencies to latest versions

## [1.0.0] - 2026-02-04

### Features

- add dynamic path rewriting
- use `path-to-regexp` 6.3.0 to use custom regexp within path segments
- add configuration file interface and loading/validation functions
- add unit tests for configuration loading and validation
- add configuration file support for CLI options and merge with command line arguments
- add tests for configuration file loading and overrides
- add configuration file support with example and options
- update README with configuration options and usage instructions
- improve configuration file support to include multiple formats and async loading
- refactor rewriteRules to use object format in configuration files and related tests

### Bug Fixes

- use .js rather than .ts
- add another few test cases
- revert unintended change for temporary publishing
- update rewrite rule formatting in documentation and validation
- prevent path traversal in getFile method and add corresponding tests, to fix the "Code scanning alert: Uncontrolled data used in path expression"
- refactor BucketFileLocal to prevent path traversal and update tests accordingly
- update CI workflow to test on multiple Node versions and use separate coverage job
- update Node.js version requirements to ">= 20"
- update @versatiles/release-tool to version 2.6.0 and ensure Node.js version requirement is set to ">= 20"
- correct formatting of warning and note sections in README.md
- add js-yaml and its type definitions to dependencies
- update c12 dependency to version 3.3.3
- ensure fail-fast is disabled in CI job matrix
- move test directory to 'temp'
- update test to throw error for array config instead of returning empty object
- update check script to run tests correctly
- remove obsolete test-node script from package.json
- update script names for consistency in package.json
- update commander and @types/node versions in package.json
- add overrides for fast-xml-parser version in package.json
- update test coverage script name in CI workflow
- add ignore rule for path-to-regexp dependency in dependabot configuration
- update version constraint for path-to-regexp in dependabot configuration

### Code Refactoring

- streamline command line options merging for improved readability

### Documentation

- add note about path rewriting
- update configuration file

### Tests

- use unique temporary directories for test cases
- update config loading tests
- update error messages and assertions in config loading tests
- mock and check logging in options tests for Rewrite class

### Chores

- update .gitignore to include .vscode/ and remove obsolete settings.json
- update devDependencies to latest versions
- add edge test case
- change def. sep. to ` `
- update dependencies to include c12 and remove js-yaml
- update @versatiles/release-tool in package.json and package-lock.json

