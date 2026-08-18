# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.1] - 2026-08-18

### Chores

- add security update groups for GitHub Actions and npm in dependabot configuration ([b3a5b99](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/b3a5b9999dbd842c05fd5c9d6e82f7266903ea14))
- update dependencies to latest versions ([68933c8](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/68933c84f6b53cdeedf8b4e3fcf3e868067b8a27))

## [2.1.0] - 2026-08-10

### Breaking Changes

- update changelog for version 2.0.0 with breaking changes and new features ([8c53bff](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/8c53bff89836557faa29d1725408bef50e6ab52e))

### Features

- update readiness endpoint to return JSON with version and readiness status feat: add version test to verify package version from package.json ([dea8420](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/dea8420d45685a6e35059cdbb30f90c9aac87aca))
- enhance handling of 204 No Content responses for sparse containers with caching and validation ([3310193](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/331019313f9f5092157986d68d2b7a30aa312104))
- add 'x-content-type-options' header to prevent content type sniffing ([9669828](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/96698289284cda2a04a1702803a0ec7027629f82))
- set fixed headers for error responses to prevent caching and enforce content type ([17cbd07](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/17cbd072f5d6d808e08779744d8229ae5445ce34))
- improve error handling for malformed rewrite rules and ensure graceful exits ([32b61d8](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/32b61d80f49645e6b0670cbf5ef40658035fcae5))
- add port validation and error handling for CLI and environment variables ([6b0943c](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/6b0943cc03598ebead25cdcd99a92dfcd4ac3a96))
- implement support for content encoding in bucket file handling and metadata ([78af44a](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/78af44ae10d22d566c8e10102fe859f1239b7401))
- skip the body pipeline for HEAD requests ([a1192fb](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/a1192fb17a2649456cd8ac1bedfff994dd57247e))
- implement shared loading for concurrent requests in ContainerCache ([45be32f](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/45be32f7a2b905455d76d64cfd8505562a3c1880))
- update maplibre-gl source to use VersaTiles CDN ([6cbafa9](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/6cbafa969ac6ad1c4b7307f6c3cec39f4e33b045))
- update TypeScript configuration and add Vitest setup for testing ([d5f04fd](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/d5f04fdb07c6f27668b3ebc14d36f0fafb34b735))

### Bug Fixes

- add baseUrl option to server options and ensure it ends with a slash ([1af29c8](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/1af29c82799e9ebaa8f5f4d48dc0c265cfa144db))
- update license badge in README to reflect Unlicense ([96007f0](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/96007f00acbca3705a72a8662e98608168ffd022))
- update upgrade script to ignore specific dependencies ([af51a26](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/af51a26878650e0f8da089aa48dddd14ff38b307))

### Performance Improvements

- cap brotli quality for large payloads ([999487d](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/999487dc3029d4cf5b129709f7de5cde9b3e40a8))

### Code Refactoring

- move function to retrieve package version to separate module ([0b693e4](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/0b693e4548842e566631b00cffe7553e6685ac9a))
- remove caching mechanism from Rewrite class and related tests ([e65bf90](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/e65bf905570faf001bd993398d9810a87bdeabea))
- remove unused prefix and eslintConfig from package.json ([59706b7](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/59706b781bb2ba611f3c8549ea011ef9bf348c85))

### Chores

- update devDependencies to latest versions ([92a4eb6](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/92a4eb60800397fd11fd1af06fb7b8c58a7696ff))
- update version to 2.1.0 in package.json and package-lock.json, and enhance changelog with new features and bug fixes ([7b7ff40](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/7b7ff40a55fd2d23135342eff539794e781ce7cd))

## [2.1.0] - 2026-08-09

### Breaking Changes

- update changelog for version 2.0.0 with breaking changes and new features ([8c53bff](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/8c53bff89836557faa29d1725408bef50e6ab52e))

### Features

- update readiness endpoint to return JSON with version and readiness status feat: add version test to verify package version from package.json ([dea8420](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/dea8420d45685a6e35059cdbb30f90c9aac87aca))
- enhance handling of 204 No Content responses for sparse containers with caching and validation ([3310193](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/331019313f9f5092157986d68d2b7a30aa312104))
- add 'x-content-type-options' header to prevent content type sniffing ([9669828](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/96698289284cda2a04a1702803a0ec7027629f82))
- set fixed headers for error responses to prevent caching and enforce content type ([17cbd07](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/17cbd072f5d6d808e08779744d8229ae5445ce34))
- improve error handling for malformed rewrite rules and ensure graceful exits ([32b61d8](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/32b61d80f49645e6b0670cbf5ef40658035fcae5))
- add port validation and error handling for CLI and environment variables ([6b0943c](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/6b0943cc03598ebead25cdcd99a92dfcd4ac3a96))
- implement support for content encoding in bucket file handling and metadata ([78af44a](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/78af44ae10d22d566c8e10102fe859f1239b7401))
- skip the body pipeline for HEAD requests ([a1192fb](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/a1192fb17a2649456cd8ac1bedfff994dd57247e))
- implement shared loading for concurrent requests in ContainerCache ([45be32f](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/45be32f7a2b905455d76d64cfd8505562a3c1880))
- update maplibre-gl source to use VersaTiles CDN ([6cbafa9](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/6cbafa969ac6ad1c4b7307f6c3cec39f4e33b045))
- update TypeScript configuration and add Vitest setup for testing ([d5f04fd](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/d5f04fdb07c6f27668b3ebc14d36f0fafb34b735))

### Bug Fixes

- add baseUrl option to server options and ensure it ends with a slash ([1af29c8](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/1af29c82799e9ebaa8f5f4d48dc0c265cfa144db))
- update license badge in README to reflect Unlicense ([96007f0](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/96007f00acbca3705a72a8662e98608168ffd022))
- update upgrade script to ignore specific dependencies ([af51a26](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/af51a26878650e0f8da089aa48dddd14ff38b307))

### Performance Improvements

- cap brotli quality for large payloads ([999487d](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/999487dc3029d4cf5b129709f7de5cde9b3e40a8))

### Code Refactoring

- move function to retrieve package version to separate module ([0b693e4](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/0b693e4548842e566631b00cffe7553e6685ac9a))
- remove caching mechanism from Rewrite class and related tests ([e65bf90](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/e65bf905570faf001bd993398d9810a87bdeabea))
- remove unused prefix and eslintConfig from package.json ([59706b7](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/59706b781bb2ba611f3c8549ea011ef9bf348c85))

### Chores

- update devDependencies to latest versions ([92a4eb6](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/92a4eb60800397fd11fd1af06fb7b8c58a7696ff))

## [2.0.0] - 2026-08-04

This release fixes a case where an overwritten tile container could be served as corrupt tiles, closes a bypass of the `--directory` prefix, and adds HTTP range and conditional requests. It requires Node 22 and changes every `ETag`.

### ⚠ Breaking changes

| Change                                                                                  | What to expect                                                                                                 |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Node 22 or newer is required** (was Node 20)                                            | Installing on Node 20 fails. Node 20 reached end of life on 2026-04-30 and is no longer tested.                  |
| **Every `ETag` value changes**                                                            | One revalidation wave through CDN and browser caches after deploy. Tiles are re-fetched once, then settle.       |
| **The `--directory` prefix is now enforced**                                              | Requests using `..` to reach objects outside the prefix used to succeed and now return 404. See below.           |
| **Tile queries are matched strictly**                                                     | `?8/58/70junk`, `?8/58/70/99` and `?013/1870/2252` returned the tile; they now return 400. Use exact coordinates. |
| **Colons in paths resolve to themselves**                                                 | `/a:b.txt` used to serve `ab.txt`; it now serves `a:b.txt`, matching what `/a%3Ab.txt` always did.               |
| **`204 No Content` carries no `content-type`**                                            | Empty-tile responses are now bodiless as the spec requires.                                                      |
| **Log output is JSON on Cloud Run**                                                       | Detected via `K_SERVICE`. Set `LOG_FORMAT=text` to keep plain lines, or `json` to force structured output.        |

**The prefix bypass was an access-control bug.** With `--directory /public/`, a request such as `/..%2Fprivate%2Fsecret.txt` served files from outside the prefix with `200 OK`. The prefix is now a real boundary: the request path is confined before the prefix is applied, and anything escaping it is answered exactly like a missing file. If you relied on reaching objects outside your configured prefix, those requests will now fail.

**Why the `ETag`s change.** They are now quoted as RFC 9110 requires, and derived from the object's content hash rather than its `ETag`. The second part means a metadata-only edit — changing `cacheControl` or storage class — no longer invalidates every cached tile, and neither does re-uploading identical bytes. The cost is a single revalidation wave when upgrading.

### Highlights

- **Overwriting a container no longer serves corrupt tiles.** Tile-index offsets are cached across requests; resolving them against a container that had since been replaced returned unrelated bytes as a valid-looking tile. Every read is now pinned to the revision its index came from, so a replaced container is detected and the index re-read instead. See "Container caching" in the README.
- **HTTP range requests** (#2) — `206 Partial Content` with `Content-Range`, `416` for unsatisfiable ranges, and `If-Range` so a resumed download cannot splice together two versions of a file.
- **Conditional requests** — every response carries an `ETag` and honours `If-None-Match` with `304`. Tile validators are derived from the container revision and coordinates, so a revalidated tile costs **no bucket read at all**.
- **`/readiness` endpoint** — reports whether the bucket is reachable, with the result cached so probes do not drive API calls. `/healthcheck` deliberately stays dependency-free, for liveness probes that restart an instance.
- **Graceful shutdown** — `SIGTERM` and `SIGINT` now drain in-flight requests instead of dropping them, so deploys and scale-downs no longer cut responses off mid-transfer.
- **`PORT` is honoured**, so Cloud Run needs no `--port` flag. An explicit `--port` or config value still wins.
- **Fewer round trips per tile.** Responses that need no recompression stream straight through instead of being buffered, which also keeps `content-length` on large files, and a cached container no longer costs a metadata lookup per request.

### Upgrading

1. Move to Node 22 or newer.
2. Expect one round of cache revalidation after deploying; no action needed.
3. If you use `--directory`, confirm nothing depends on reaching objects outside it.
4. If you parse the server's logs, note the JSON format under Cloud Run, or set `LOG_FORMAT=text`.

### Features

- implement PathTraversalError for improved path validation and error handling ([50bc282](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/50bc28236b614bf64c378de4f949cc0457d70f4c))
- add normalizeBucketPath function for improved path validation in bucket operations ([d098457](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/d098457fe2b62aa71d0204035f979ece8dc331d8))
- add DirectStream class for efficient stream forwarding without buffering ([3212fe0](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/3212fe0f5a914cc6bf6d952e65dd84a55f637640))
- implement byte-range support for streaming responses and add parseByteRange utility, close #2 ([c0df818](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/c0df8183d121a52077b609bcbf57a9ea46e786a9))
- add readiness check endpoint to server and implement ReadinessCheck class ([637f190](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/637f1900265ce0149bd6245fdbb45f2ffef27103))
- implement ifRangeMatches function to validate If-Range headers for partial content requests ([1d33bc9](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/1d33bc9df0223439b85716928783e691d006cf40))
- implement StaleRevisionError and enhance read stream options for versioning support ([f8c2672](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/f8c2672ed538e2c2b0d0fc35a565eb8ed906ce19))
- implement conditional response handling with sendNotModified method and ifNoneMatchMatches function ([95762d3](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/95762d3c3cd7f5bb8d30559c7607303cae16bc06))
- implement ETag handling and conditional response logic in Versatiles class ([42b1eaf](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/42b1eaf697bf79d0bfc63fc25c36c0d75e1f6001))
- enhance port configuration handling to support environment variables and improve error reporting ([e8e9d5d](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/e8e9d5d06cd66f05aa68c5a6a224c38d3154c98a))
- implement graceful shutdown handling for server to ensure clean termination ([26115c7](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/26115c70f9ae7539392dea54a7d5ab2936a930cb))
- enhance config loading to handle explicit null and blank files gracefully ([0eda2c9](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/0eda2c901a16c3db0fd7e990fec244a0c96d5498))
- update Dockerfile to use Node 24 and improve package installation ([09e32fd](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/09e32fd868f0454f998bd9ef7ac3d5ad3c936e1a))
- implement structured logging and enhance error handling across the application ([14c8d2f](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/14c8d2fc8a05867d8e75ddfa09a181f0d8305c0e))
- enhance BucketFileGoogle to handle stale revisions with improved error handling in createReadStream ([d9f3c3c](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/d9f3c3ce324dacfe112df3ac49e3635b6af2da39))
- add contentHash to BucketFileMetadata and update etag generation logic ([69060a0](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/69060a050f81f6741afe9d79ca163a8322502969))
- update dependabot config to unignore TypeScript 7 and adjust upgrade script for dependencies ([6fd8745](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/6fd8745e03c26c9f03d259dc52f19aa2a38674f7))
- update CI configuration to remove Node 20 and enforce Node 22 as minimum version ([e04f5f5](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/e04f5f5586d4ca48ba9943d62e3995d4015a5ccc))
- refactor tests to use empty stream for createReadStream and clear mocks in beforeEach ([3e551c6](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/3e551c6f1e71f876b63f6db8fa09cbe146139227))

### Bug Fixes

- update funding information to reflect correct organization details ([f32e253](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/f32e25356e3c53cf3fc4df75574e5d9316e88799))
- read file directly from URL to avoid issues with percent-encoded paths ([a038996](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/a0389967ef421aad8544afb9fb3110fa31f29a97))
- improve error handling and documentation for write method in Responder class ([768265f](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/768265fbecf867578b9f9c894801f200aaae48d8))
- use fileURLToPath for correct path resolution in tests to avoid percent-encoded issues ([168abc3](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/168abc3cf007e12493f41df94f9b9ccc1326ae29))
- reject with Error object in buildReader to preserve stack trace for better error handling ([4f331eb](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/4f331eb407093aec7c76690c9e1f7a099bc9c432))
- adjust path handling in startServer to prevent incorrect filename resolution from encoded URLs ([29d2086](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/29d20864b91d411f59acf0d94af812fdbb235233))
- implement sendEmpty method in Responder for 204 No Content responses ([5223c74](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/5223c74ab56296cd2f5983981df299cdf4885ece))
- refine tile coordinate extraction regex to ensure unique cache keys for CDN ([b2179fa](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/b2179fa0a78bf16dfa14982b8cfd20292709941b))
- improve tile coordinate regex to prevent leading zeros and ensure exact matches ([93810da](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/93810dab371e3ebaf2dc27b2460110e5e8a40201))
- ensure ETag values are properly quoted according to RFC 9110 ([840a21f](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/840a21f091550af3d332d6213a7207c374a89728))
- improve server startup error handling and ensure promise rejection on bind failure ([60157d8](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/60157d8e32cece59aca8343925bed93316031105))
- reorder CI steps for consistency in formatting and typechecking checks ([358b963](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/358b963ec29ee5a1edb3883bbba594b34762b9a7))

### Code Refactoring

- simplify getVersatiles function and update serve method to accept URL parameter ([1494614](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/1494614de9a3db8d7109cd15ca793ac787a51b56))
- replace getVersatiles function with ContainerCache in server and tests ([a63df43](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/a63df43166420b81be9c1215248d0b7540e9a08f))
- remove abstract exists method from AbstractBucketFile and its implementations ([efc8530](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/efc85305455106b77740745f32e872dfe559cc74))

### Documentation

- enhance rewrite rule documentation for clarity and usage examples ([a174cad](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/a174cad29770cdd612954387bf7b540b307c2920))
- update README.md for clarity in rewrite rules section ([71a4a06](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/71a4a0657f069a32f0e898afdc4737251f033e5b))
- update diagram in README ([405d5e0](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/405d5e06d019f2c3aa9e48cfa9a94d36eee4f7b4))
- add section on range requests for static file handling in README ([5554643](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/55546438a69a2ef346b79b52238d5608518034d0))
- add health endpoints section to README for load balancer integration ([1eb63c0](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/1eb63c0a93599d9346e1fd2d89efbdd03b2fc73c))
- update README to clarify best practices for tile set publishing and container caching ([2349673](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/2349673de26c43bba2a3640921d6209e8b3c09e6))

### Tests

- update caching behavior for non-matching paths and add semantic characterisation suite ([2c4f387](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/2c4f3871d69233067c7662c56ba7a9c0d3cd16d2))
- add tests for parameter modifier repetition and anchoring rules ([dff88c4](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/dff88c43ea684f752c3c4089a372f19ac39ad24e))
- add backstop test for path-to-regexp version compatibility ([94d96c8](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/94d96c86e0458e2db440b4788cd7f7f8c5199a1d))
- add tests for normalizeBucketPath function and bucket prefix confinement in server ([4aaea39](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/4aaea395a4c66dc4fcf92df293fc5e78eba575a5))
- add tests for handling colons in paths to ensure correct file resolution ([e83a4f5](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/e83a4f56511aea0057839272a1c7bfadc1c8867c))
- ensure 204 responses carry no content or content-type in tests ([9056ef0](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/9056ef02a2ea27a1c5f07f6d2cb972a4e0e7d2b0))
- add validation for trailing characters in tile coordinate queries ([77b3630](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/77b3630e741d66b75bbc4b1d1c4524ad5b0a9bc2))
- add direct forwarding tests for known content-length handling in recompression ([af6bb49](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/af6bb497ecd6143229a6b7f5c9dfc434d58161af))
- add unit tests for parseByteRange function to validate range handling ([234ad74](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/234ad74214ebf5aa0bc780c22d5bbcf8f223140d))
- update getVersatiles tests to use URL parameter for serve method ([54ca984](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/54ca98437d09c5c63d9f1f2a24f42e5de44d0257))
- add liveness and readiness checks for FlakyBucket in server tests ([b310bde](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/b310bde55ced04ac7664971d5aed5cc365302e5b))
- add validation for leading zeros in tile coordinates and ensure zero coordinate is accepted ([981bcb8](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/981bcb89cce494516d59f458eefd688125055a2f))
- add tests for ifRangeMatches function and conditional ranges handling ([35bf8a5](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/35bf8a569366005ebbe6cee87d90fb5709183c3f))
- implement VersionedFile class with revision pinning and background refresh logic ([6747c30](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/6747c30cc91f5cf0bbbdc8708110af0204d84d82))
- add unit tests for ifNoneMatchMatches function to validate ETag comparisons ([cc07ecb](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/cc07ecb9b9f00e4262a271af2002d1b226ea6f7c))

### Build System

- **deps:** bump actions/setup-node from 6 to 7 in the action group ([b2c834e](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/b2c834ed2c77af0d574654f84bd04b4853adca5f))

### Chores

- update dependencies in package.json ([901a2bc](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/901a2bcc3fe710224d158804c8428eb7d65bc2cb))
- update .prettierignore and .prettierrc for markdown formatting, adjust package.json formatting scripts ([6beb424](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/6beb4246373837a5b69a6ef52718fdf3f77d5df6))
- update formatting in configuration files and HTML doctype for consistency ([13c95ed](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/13c95ed6f506180e91ccb76cf9107d9b5a42fe17))
- update package-lock.json and remove teeny-request override from package.json ([24fe4ae](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/24fe4ae7093371b59651945d67b70ddafb36a462))
- update path-to-regexp version constraint in dependabot.yml for compatibility ([ffa7fd3](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/ffa7fd3bfc72c146988c7460a233b8ce3ee22c70))
- improve upgrade script for path-to-regexp dependency management ([6401739](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/640173990ac7d3663c0d255f2743bec7bd70cef2))

## [1.1.5] - 2026-07-08

### Bug Fixes

- update @versatiles/container dependency to version 1.5.0 ([c15ec64](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/c15ec6403e658a47061b9a8f6890674769e89136))

## [1.1.4] - 2026-07-08

### Features

- implement cache size limit and eviction for Rewrite class ([b715d44](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/b715d448978b71a336303a2195ee691c7c7811b8))
- enhance encoding handling with quality-based selection and explicit rejection support ([9d0db4c](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/9d0db4c1e48b68d3d8aee937d26beb4cab1b469d))
- enhance error handling in encoding functions to reject invalid input ([bac5eb4](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/bac5eb4ed1eea4b966bac02752a331b3cd9069d7))
- implement a bounded least-recently-used cache for VersaTiles containers ([0f05dfb](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/0f05dfbfffa2e1e45ffb1631a973c855b16856b0))

### Bug Fixes

- remove versioning from server header in response headers ([258f9c0](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/258f9c0fb1f88f962ead217fd70549a6dd9cb3af))
- improve error handling for style.json generation to prevent internal message leakage ([f4852d9](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/f4852d9f5b02a84b6e745bbd5478ea3c9b7705a3))

### Tests

- add tests for ErroringBucketFile and enhance Responder error handling ([a4c20f4](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/a4c20f474fdc96adc7f8595a7773fd56f2c59539))
- implement error handling for streaming failures in MockedServer tests ([5827d7e](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/5827d7e6eab7edc28cbaab3c183ba1dd80f0de2d))
- add error handling for invalid metadata in style.json generation ([2611274](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/2611274f0eae80959e88c4000d3ce26fd8ef4944))
- add path traversal handling to reject encoded directory escapes ([747e16e](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/747e16e6ef447df1d89d4871f94c5bafa9ac487a))
- add unit tests for ContainerCache functionality ([64dabab](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/64dabab296a95b2cd1829fdfb1aeaf8d1fd38744))

### Build System

- **deps:** bump the action group with 2 updates ([6327209](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/6327209a8848a855895b43232c2337919758933b))

### Chores

- **deps:** update dependencies to latest versions ([80c9eea](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/80c9eeacc216af860e986bbc4ff938d05b46e4d5))
- add allowScripts configuration for esbuild and fsevents ([7997b02](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/7997b0217fea12bfa5c0ad0848ec16af3626d866))
- **deps:** update uuid to version 11.1.1 and teeny-request to 10.1.3 ([7e278dc](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/7e278dc63fd722784853c0cceb0b5694af0f6c0a))

### Styles

- format code ([ce24741](https://github.com/versatiles-org/node-versatiles-google-cloud/commit/ce24741dd5827cfb17de9f3c94f6ef5f5bfd7eab))

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

