# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] - 2026-05-15

### Build System

- **deps:** bump codecov/codecov-action from 5 to 6 in the action group ([2191cc6](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/2191cc68375c7076a91c119d27c3d2197b4abe14))

### Chores

- update dependencies and improve upgrade script ([10b2caf](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/10b2cafb5b70bd14a8f85157a5d657fc9663ccd7))
- update tsconfig.build.json to include rootDir in compilerOptions ([75ef594](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/75ef5946399014e9baf5c1bfa158daee2d8ca6ae))
- update package-lock.json and package.json to remove deprecated dependencies and add overrides for teeny-request ([26fa8c1](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/26fa8c113e23ba1965239519c33e134db6427621))

## [1.1.2] - 2026-03-20

### Chores

- update dependencies to latest versions

## [1.1.1] - 2026-03-02

### Chores

- update dependencies for @typescript-eslint and eslint to latest versions
- update @versatiles/container and @versatiles/style to latest versions; update @types/node and @types/supertest
- add typecheck script to check TypeScript types in the check command

## [1.1.0] - 2026-02-19

### Features

- add support for tiles.json as alias for meta.json in request handling
- add test for starting server with versatiles rewrite rule
- enhance rewrite rules for server requests and add tests for tiles.json handling

### Bug Fixes

- disable validation to ensure that strings containing "/" are allowed
- enhance error handling by adding cause to config and rewrite rule errors
- update request handling to use request.url instead of request.path
- omit dev dependencies in npm audit for vulnerability checks

### Documentation

- add comments explaining handling of query parameters in tile path rewrites
- update rewrite rule option description for clarity and usage examples
- add detailed examples and explanations for VersaTiles container query rewrites

### Tests

- add tile path rewriting tests for versatiles container
- shorter paths for testing
- add case for preserving backslash-question-mark in versatiles rewrite rules

### Chores

- add Prettier for code formatting and update package dependencies
- update dependencies and devDependencies in package.json
- update check script to include format checking
- update package-lock.json and package.json to manage eslint dependency
- update fast-xml-parser to version 5.3.6 and remove overrides
- update CI workflow to remove unnecessary branch and tag triggers

### Styles

- improve code formatting

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

