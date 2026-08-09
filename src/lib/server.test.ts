import { vi, it, describe, beforeAll, afterAll, expect } from 'vitest';
import { MockedBucket } from './bucket/bucket.mock.js';
import { AbstractBucket, AbstractBucketFile } from './bucket/abstract.js';
import { BucketFileMetadata } from './bucket/metadata.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import { startServer } from './server.js';
import type { Server } from 'http';
import { brotliDecompressSync, gunzipSync } from 'zlib';
import type { AddressInfo } from 'net';
import http from 'http';

vi.spyOn(console, 'log').mockReturnValue();
vi.spyOn(console, 'error').mockReturnValue();
vi.mock('@google-cloud/storage'); // Mock Google Cloud Storage

/**
 * A bucket whose files fail while streaming (after metadata succeeds). Used to
 * verify the server surfaces a 500 instead of crashing on an unhandled
 * rejection when recompression of a failing stream is awaited.
 */
class ErroringBucketFile extends AbstractBucketFile {
	public get name(): string {
		return 'erroring.bin';
	}
	public async getMetadata(): Promise<BucketFileMetadata> {
		return new BucketFileMetadata({ filename: 'erroring.bin', size: 100 });
	}
	public createReadStream(): Readable {
		return new Readable({
			read(): void {
				this.destroy(new Error('simulated stream failure'));
			},
		});
	}
}

class ErroringBucket extends AbstractBucket {
	public async check(): Promise<void> {
		await Promise.resolve();
	}
	public getFile(): AbstractBucketFile {
		return new ErroringBucketFile();
	}
}

// fileURLToPath, not .pathname: the latter is percent-encoded, so any path
// component containing a space (or other encoded character) would not resolve.
const basePath = fileURLToPath(new URL('../../', import.meta.url));

// Read from the real package.json rather than hard-coded, so a release does not
// have to touch this test.
const { version: packageVersion } = JSON.parse(
	readFileSync(resolve(basePath, 'package.json'), 'utf8'),
) as { version: string };

interface MockedServerOptions {
	baseUrl?: string;
	bucket?: AbstractBucket | string;
	bucketPrefix?: string;
	localDirectory?: string;
	port?: number;
	returnRawBuffer?: boolean;
	rewriteRules?: Record<string, string>;
}

interface MockedResponse {
	contentEncoding?: string;
	contentLength: number;
	contentType?: string;
	headers: http.IncomingHttpHeaders;
	rawBuffer: Buffer;
	buffer: Buffer;
	status: number;
	text: string;
}

class MockedServer {
	readonly #opt: MockedServerOptions;

	readonly #bucket: AbstractBucket | string;

	#server?: Server;

	private constructor(opt?: MockedServerOptions) {
		this.#opt = opt ?? {};

		if (this.#opt.bucket != null) {
			this.#bucket = this.#opt.bucket;
		} else {
			this.#bucket = new MockedBucket([
				{ name: 'static/package.json', filename: resolve(basePath, 'package.json') },
				{ name: 'static/has space/package.json', filename: resolve(basePath, 'package.json') },
				{
					name: 'geodata/test.versatiles',
					filename: resolve(basePath, 'testdata/island.versatiles'),
				},
			]);
		}
	}

	public static async create(opt?: MockedServerOptions): Promise<MockedServer> {
		const me = new MockedServer(opt);

		const port = me.#opt.port ?? 0;
		const server = await startServer({
			baseUrl: me.#opt.baseUrl ?? 'http://localhost:' + port,
			bucket: me.#bucket,
			bucketPrefix: me.#opt.bucketPrefix ?? '',
			fastRecompression: false,
			localDirectory: me.#opt.localDirectory,
			port,
			rewriteRules: me.#opt.rewriteRules ?? {
				'/g/:name/:args(.*)': '/geodata/:name.versatiles\\?:args',
			},
			verbose: false,
		});

		if (server == null) throw Error();

		me.#server = server;

		return me;
	}

	public async get(urlString: string, headers?: Record<string, string>): Promise<MockedResponse> {
		const { port } = this.#server?.address() as AddressInfo;
		const url = new URL(urlString, new URL(`http://localhost:${port}`));

		return new Promise((resolvePromise, rejectPromise) => {
			http
				.get(url, { headers }, (response) => {
					const data: Buffer[] = [];
					response.on('data', (chunk: Buffer) => {
						data.push(chunk);
					});
					response.on('end', () => {
						const rawBuffer = Buffer.concat(data);
						const contentEncoding = response.headers['content-encoding'];
						const contentType = (response.headers['content-type'] ?? '').replace(/;.*/, '');

						let buffer: Buffer;
						switch (contentEncoding) {
							case undefined:
								buffer = rawBuffer.subarray();
								break;
							case 'gzip':
								buffer = gunzipSync(rawBuffer);
								break;
							case 'br':
								buffer = brotliDecompressSync(rawBuffer);
								break;
							default:
								console.log('ERROR:', { contentEncoding });
								rejectPromise('unknown encoding: ' + contentEncoding);
								return;
						}

						resolvePromise({
							contentEncoding,
							contentLength: Number(response.headers['content-length']),
							contentType,
							headers: response.headers,
							rawBuffer,
							buffer,
							status: response.statusCode ?? 0,
							text: buffer.toString(),
						});
					});
				})
				.on('error', (err) => {
					rejectPromise(`Got error: ${err.message}`);
				})
				.end();
		});
	}

	public async close(): Promise<void> {
		const server = this.#server;
		if (server === undefined) throw Error();
		await new Promise<void>((res) =>
			server.close(() => {
				res();
			}),
		);
		return;
	}
}

describe('Server', () => {
	describe('simple requests', () => {
		let server: MockedServer;

		beforeAll(async () => {
			server = await MockedServer.create();
		});

		afterAll(async () => {
			await server.close();
		});

		it('health check endpoint', async () => {
			const response = await server.get('/healthcheck');
			expect(response.status).toBe(200);
			expect(response.text).toBe('ok');
			expect(response.contentType).toBe('text/plain');
		});

		it('rewrites path according to rules', async () => {
			const response = await server.get('/g/test/meta.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"vector_layers"/);
			expect(response.contentType).toBe('application/json');
		});

		it('serve static file', async () => {
			const response = await server.get('/static/package.json');
			expect(response.status).toBe(200);
			expect(JSON.parse(response.text)).toMatchObject({ name: '@versatiles/google-cloud' });
			expect(response.contentType).toBe('application/json');
		});

		it('serve static file with a space in the path', async () => {
			const response = await server.get('/static/has space/package.json');
			expect(response.status).toBe(200);
			expect(JSON.parse(response.text)).toMatchObject({ name: '@versatiles/google-cloud' });
			expect(response.contentType).toBe('application/json');
		});

		// The bucket serves whatever the operator uploaded, so a browser must be
		// held to the declared content-type rather than sniffing the bytes.
		it('tells browsers not to sniff the content type', async () => {
			for (const path of ['/static/package.json', '/geodata/test.versatiles?meta.json']) {
				const response = await server.get(path);
				expect(response.headers['x-content-type-options'], path).toBe('nosniff');
			}
		});

		it('serve versatiles meta', async () => {
			const response = await server.get('/geodata/test.versatiles?meta.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"vector_layers"/);
			expect(response.contentType).toBe('application/json');
		});

		it('serve versatiles style', async () => {
			const response = await server.get('/geodata/test.versatiles?style.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"version":8/);
			expect(response.contentType).toBe('application/json');
		});

		it('serve versatiles preview', async () => {
			const response = await server.get('/geodata/test.versatiles?preview');
			expect(response.status).toBe(200);
			// The HTML5 doctype is case-insensitive, so do not pin its casing.
			expect(response.text).toMatch(/^<!doctype html>/i);
			expect(response.contentType).toBe('text/html');
		});

		it('serve versatiles tile', async () => {
			const response = await server.get('/geodata/test.versatiles?14/3740/4505');
			expect(response.status).toBe(200);
			expect(response.text).toContain('water_lines');
			expect(response.contentType).toBe('application/x-protobuf');
		});

		it('handle missing versatiles tile', async () => {
			const response = await server.get('/geodata/test.versatiles?10/0/0');
			expect(response.status).toBe(204);
			expect(response.text).toBe('');
			// A 204 carries no content, so it must not announce a content-type.
			expect(response.contentType).toBe('');
		});

		// A sparse container has far more absent tiles than present ones, so an
		// uncacheable 204 means a permanent origin hit for each of them.
		it('lets a missing versatiles tile be cached and revalidated', async () => {
			const response = await server.get('/geodata/test.versatiles?10/0/0');
			expect(response.status).toBe(204);
			expect(response.headers['cache-control']).toBe('max-age=86400');
			expect(response.headers.vary).toBe('accept-encoding');

			const etag = response.headers.etag;
			expect(etag).toMatch(/^"/);

			const revalidated = await server.get('/geodata/test.versatiles?10/0/0', {
				'If-None-Match': etag as string,
			});
			expect(revalidated.status).toBe(304);
		});

		it('handle missing static file', async () => {
			const response = await server.get('/static/missing/file');
			expect(response.status).toBe(404);
			expect(response.text).toBe('file "/static/missing/file" not found');
			expect(response.contentType).toBe('text/plain');
		});

		// An object may well be uploaded a moment later, so a cached 404 outlives
		// its truth. Recomputing one is cheap — a missing file is answered without
		// ever transferring a body.
		it('keeps errors out of caches', async () => {
			const response = await server.get('/static/missing/file');
			expect(response.headers['cache-control']).toBe('no-store');
			expect(response.headers['x-content-type-options']).toBe('nosniff');
			expect(response.headers.etag).toBeUndefined();
		});

		it('handle wrong versatiles request', async () => {
			const response = await server.get('/geodata/test.versatiles?everest');
			expect(response.status).toBe(400);
			expect(response.text).toBe(
				'get parameter must be "?preview", "?meta.json", "?tiles.json", "?style.json", or "?{z}/{x}/{y}"',
			);
			expect(response.contentType).toBe('text/plain');
		});
	});

	// The base URL is concatenated with a slash-less filename to build the tile
	// URLs in style.json, so it has to end in "/". URL only adds that slash when
	// the path is empty, so a base URL naming a subdirectory used to produce
	// ".../mapsgeodata/test.versatiles" — a URL that resolves to nothing.
	describe('base URL with a path', () => {
		let server: MockedServer;

		beforeAll(async () => {
			server = await MockedServer.create({ baseUrl: 'http://localhost:8080/maps' });
		});

		afterAll(async () => {
			await server.close();
		});

		it('separates the base URL from the filename in style.json', async () => {
			const response = await server.get('/geodata/test.versatiles?style.json');
			expect(response.status).toBe(200);

			const style = JSON.parse(response.text) as { sources: Record<string, { tiles: string[] }> };
			const [source] = Object.values(style.sources);

			expect(source.tiles).toStrictEqual([
				'http://localhost:8080/maps/geodata/test.versatiles?{z}/{x}/{y}',
			]);
		});
	});

	describe('stream error handling', () => {
		let server: MockedServer;

		beforeAll(async () => {
			server = await MockedServer.create({ bucket: new ErroringBucket() });
		});

		afterAll(async () => {
			await server.close();
		});

		it('responds with 500 when the bucket stream fails mid-request', async () => {
			const response = await server.get('/erroring.bin');
			expect(response.status).toBe(500);
			expect(response.contentType).toBe('text/plain');
			expect(response.text).toContain('Internal Server Error');
		});
	});

	describe('path traversal', () => {
		let server: MockedServer;

		beforeAll(async () => {
			// Serve from the "static" directory so we can attempt to escape it.
			server = await MockedServer.create({ localDirectory: resolve(basePath, 'static') });
		});

		afterAll(async () => {
			await server.close();
		});

		it('rejects percent-encoded traversal instead of serving files outside the directory', async () => {
			// The slash is also encoded (%2f) so the whole segment survives URL
			// normalisation and is only decoded to "../" afterwards, targeting the
			// real project package.json one level above "static".
			const response = await server.get('/%2e%2e%2fpackage.json');
			expect(response.status).toBe(404);
			expect(response.text).not.toContain('@versatiles/google-cloud');
		});

		// A rejected path must be indistinguishable from a file that simply is not
		// there: same status, same content-type, same body shape. Answering 500
		// instead would confirm to a prober that the path was special, and would
		// misreport a rejected client request as a server fault.
		it('answers a rejected path exactly like a missing file', async () => {
			const missing = await server.get('/no-such-file.txt');
			const rejected = await server.get('/%2e%2e%2fpackage.json');

			expect(missing.status).toBe(404);
			expect(rejected.status).toBe(missing.status);
			expect(rejected.contentType).toBe(missing.contentType);
			expect(rejected.text).toBe('file "/%2e%2e%2fpackage.json" not found');
			expect(rejected.text).not.toMatch(/traversal/i);
		});

		it('does not print a stack trace for a rejected path', async () => {
			const errorSpy = vi.mocked(console.error);
			errorSpy.mockClear();

			await server.get('/%2e%2e%2fpackage.json');

			// Client-controlled input, so an unauthenticated caller could otherwise
			// flood the logs by repeating the request.
			expect(errorSpy).not.toHaveBeenCalled();
		});

		it('answers malformed percent-encoding with 400', async () => {
			for (const path of ['/%zz', '/%E0%A4%A', '/%']) {
				const response = await server.get(path);
				expect(response.status, path).toBe(400);
				expect(response.text, path).toBe('invalid URL encoding in request path');
			}
		});
	});

	describe('bucket prefix confinement', () => {
		let server: MockedServer;

		beforeAll(async () => {
			// Serve the project root through the "static/" prefix, so escaping the
			// prefix would expose the real package.json one level above it.
			server = await MockedServer.create({
				localDirectory: basePath,
				bucketPrefix: 'static/',
			});
		});

		afterAll(async () => {
			await server.close();
		});

		it('serves files inside the prefix', async () => {
			const response = await server.get('/preview.html');
			expect(response.status).toBe(200);
		});

		// The prefix must be a real boundary. Before this was enforced, ".." in
		// the request escaped it and served files from outside: the prefix was
		// concatenated first, after which "static/../package.json" normalised to
		// a path that looked entirely legitimate.
		it('does not serve files outside the prefix', async () => {
			for (const path of ['/..%2Fpackage.json', '/%2e%2e%2fpackage.json', '/..%2f..%2fetc']) {
				const response = await server.get(path);
				expect(response.status, path).toBe(404);
				expect(response.text, path).not.toContain('@versatiles/google-cloud');
			}
		});

		it('still resolves "." and ".." that stay inside the prefix', async () => {
			const response = await server.get('/./preview.html');
			expect(response.status).toBe(200);
		});
	});

	describe('liveness and readiness', () => {
		/** A bucket that starts healthy and can be broken afterwards. */
		class FlakyBucket extends AbstractBucket {
			public failing = false;
			public checks = 0;

			public async check(): Promise<void> {
				this.checks++;
				if (this.failing) throw new Error('credentials expired');
				await Promise.resolve();
			}

			public getFile(): AbstractBucketFile {
				return new ErroringBucketFile();
			}
		}

		let bucket: FlakyBucket;
		let server: MockedServer;

		beforeAll(async () => {
			bucket = new FlakyBucket();
			server = await MockedServer.create({ bucket });
		});

		afterAll(async () => {
			await server.close();
		});

		// Liveness must not depend on the bucket: a Cloud Storage problem should
		// take instances out of rotation, not have them killed and restarted.
		it('healthcheck stays ok while the bucket is failing', async () => {
			bucket.failing = true;
			const response = await server.get('/healthcheck');

			expect(response.status).toBe(200);
			expect(response.text).toBe('ok');

			bucket.failing = false;
		});

		it('reports ready while the bucket is reachable', async () => {
			const response = await server.get('/readiness');

			expect(response.status).toBe(200);
			expect(response.contentType).toBe('application/json');
			expect(JSON.parse(response.text)).toEqual({ ready: true, version: packageVersion });
		});

		it('reports 503 once the bucket stops answering', async () => {
			// A fresh server, so the startup check does not prime the cache with a
			// success that would still be valid here.
			const flaky = new FlakyBucket();
			const isolated = await MockedServer.create({ bucket: flaky });

			flaky.failing = true;
			const response = await isolated.get('/readiness');

			expect(response.status).toBe(503);
			// The version is reported even while failing, so a bad rollout is
			// identifiable from the probe alone.
			expect(JSON.parse(response.text)).toEqual({ ready: false, version: packageVersion });
			// The reason may name buckets or credentials, so it is logged only.
			expect(response.text).not.toContain('credentials expired');

			await isolated.close();
		});

		it('does not probe the bucket on every readiness request', async () => {
			const flaky = new FlakyBucket();
			const isolated = await MockedServer.create({ bucket: flaky });

			const before = flaky.checks;
			for (let i = 0; i < 5; i++) await isolated.get('/readiness');

			// At most one further check beyond whatever startup already did.
			expect(flaky.checks - before).toBeLessThanOrEqual(1);

			await isolated.close();
		});
	});

	describe('conditional requests', () => {
		let server: MockedServer;

		beforeAll(async () => {
			server = await MockedServer.create({
				bucket: new MockedBucket([{ name: 'a.txt', content: Buffer.from('some content') }]),
				rewriteRules: {},
			});
		});

		afterAll(async () => {
			await server.close();
		});

		const etagOf = async (): Promise<string> => (await server.get('/a.txt')).headers.etag as string;

		it('answers 304 when the client already has the current representation', async () => {
			const etag = await etagOf();
			const response = await server.get('/a.txt', { 'If-None-Match': etag });

			expect(response.status).toBe(304);
			expect(response.text).toBe('');
		});

		it('accepts weak, listed and wildcard forms', async () => {
			const etag = await etagOf();

			for (const value of [`W/${etag}`, `"other", ${etag}`, '*']) {
				const response = await server.get('/a.txt', { 'If-None-Match': value });
				expect(response.status, value).toBe(304);
			}
		});

		it('sends the body when the validator does not match', async () => {
			const response = await server.get('/a.txt', { 'If-None-Match': '"stale"' });

			expect(response.status).toBe(200);
			expect(response.text).toBe('some content');
		});

		// A 304 carries no body, so headers describing one must not be sent, while
		// the validator and caching headers are kept as they would be on a 200.
		it('omits body headers but keeps the validator', async () => {
			const etag = await etagOf();
			const response = await server.get('/a.txt', { 'If-None-Match': etag });

			expect(response.headers.etag).toBe(etag);
			expect(response.headers['cache-control']).toBeDefined();
			expect(response.headers['content-type']).toBeUndefined();
			expect(response.headers['content-length']).toBeUndefined();
			expect(response.headers['content-encoding']).toBeUndefined();
		});

		// RFC 9110 §13.2.1: If-None-Match is evaluated first, so a matching
		// validator wins over a range request rather than producing a 206.
		it('takes precedence over a Range request', async () => {
			const etag = await etagOf();
			const response = await server.get('/a.txt', {
				'If-None-Match': etag,
				Range: 'bytes=0-3',
			});

			expect(response.status).toBe(304);
			expect(response.headers['content-range']).toBeUndefined();
		});
	});

	describe('range requests', () => {
		const CONTENT = '0123456789abcdefghijklmnopqrstuvwxyz'; // 36 bytes
		let server: MockedServer;

		beforeAll(async () => {
			server = await MockedServer.create({
				bucket: new MockedBucket([{ name: 'alpha.txt', content: Buffer.from(CONTENT) }]),
				rewriteRules: {},
			});
		});

		afterAll(async () => {
			await server.close();
		});

		const range = async (value: string): Promise<MockedResponse> =>
			server.get('/alpha.txt', { Range: value, 'Accept-Encoding': 'gzip' });

		it('advertises range support on a full response', async () => {
			const response = await server.get('/alpha.txt');
			expect(response.status).toBe(200);
			expect(response.headers['accept-ranges']).toBe('bytes');
		});

		it('serves an explicit range as 206', async () => {
			const response = await range('bytes=10-19');

			expect(response.status).toBe(206);
			expect(response.text).toBe('abcdefghij');
			expect(response.headers['content-range']).toBe('bytes 10-19/36');
			expect(response.contentLength).toBe(10);
		});

		it('serves an open-ended and a suffix range', async () => {
			const open = await range('bytes=30-');
			expect(open.status).toBe(206);
			expect(open.text).toBe('uvwxyz');
			expect(open.headers['content-range']).toBe('bytes 30-35/36');

			const suffix = await range('bytes=-6');
			expect(suffix.status).toBe(206);
			expect(suffix.text).toBe('uvwxyz');
			expect(suffix.headers['content-range']).toBe('bytes 30-35/36');
		});

		it('clamps a range that runs past the end', async () => {
			const response = await range('bytes=0-999');

			expect(response.status).toBe(206);
			expect(response.text).toBe(CONTENT);
			expect(response.headers['content-range']).toBe('bytes 0-35/36');
		});

		it('answers an unsatisfiable range with 416 and no body', async () => {
			const response = await range('bytes=36-40');

			expect(response.status).toBe(416);
			expect(response.text).toBe('');
			expect(response.headers['content-range']).toBe('bytes */36');
		});

		// A byte range names offsets in the stored representation, so a range
		// response must never be recompressed — the body would no longer match the
		// offsets in Content-Range. The client asks for gzip in every case here.
		it('never encodes a range response', async () => {
			for (const value of ['bytes=0-9', 'bytes=30-', 'bytes=-6']) {
				const response = await range(value);
				expect(response.status, value).toBe(206);
				expect(response.headers['content-encoding'], value).toBeUndefined();
			}
		});

		it('still negotiates encoding for a full response', async () => {
			const response = await server.get('/alpha.txt', { 'Accept-Encoding': 'gzip' });

			expect(response.status).toBe(200);
			expect(response.contentEncoding).toBe('gzip');
			expect(response.text).toBe(CONTENT);
		});

		// If-Range exists so that a client resuming an interrupted download of a
		// file that changed in the meantime does not splice together bytes from
		// two versions. A stale validator must yield the whole representation.
		describe('conditional ranges', () => {
			const conditional = async (ifRange: string): Promise<MockedResponse> =>
				server.get('/alpha.txt', { Range: 'bytes=10-19', 'If-Range': ifRange });

			it('serves the range when the validator still matches', async () => {
				const { headers } = await server.get('/alpha.txt');
				const etag = headers.etag as string;

				const response = await conditional(etag);

				expect(response.status).toBe(206);
				expect(response.text).toBe('abcdefghij');
				expect(response.headers['content-range']).toBe('bytes 10-19/36');
			});

			it('serves the full body when the validator is stale', async () => {
				const response = await conditional('some-older-etag');

				expect(response.status).toBe(200);
				expect(response.text).toBe(CONTENT);
				expect(response.headers['content-range']).toBeUndefined();
			});

			it('serves the full body for a weak validator or a date', async () => {
				const { headers } = await server.get('/alpha.txt');
				const etag = headers.etag as string;

				for (const value of [`W/"${etag}"`, 'Tue, 04 Aug 2026 12:00:00 GMT']) {
					const response = await conditional(value);
					expect(response.status, value).toBe(200);
					expect(response.text, value).toBe(CONTENT);
				}
			});

			it('ignores If-Range when no Range was requested', async () => {
				const response = await server.get('/alpha.txt', { 'If-Range': 'some-older-etag' });

				expect(response.status).toBe(200);
				expect(response.text).toBe(CONTENT);
			});
		});

		// Ignoring a Range header and sending the whole representation is always
		// permitted, and is simpler than emitting multipart/byteranges.
		it('falls back to the full body for ranges it will not serve', async () => {
			for (const value of ['bytes=9-0', 'bytes=0-4,10-14', 'items=0-9', 'bytes=-']) {
				const response = await range(value);
				expect(response.status, value).toBe(200);
				expect(response.text, value).toBe(CONTENT);
				expect(response.headers['content-range'], value).toBeUndefined();
			}
		});
	});

	describe('colons in paths', () => {
		let server: MockedServer;

		beforeAll(async () => {
			server = await MockedServer.create({
				bucket: new MockedBucket([
					{ name: 'ab.txt', content: Buffer.from('WITHOUT COLON') },
					{ name: 'a:b.txt', content: Buffer.from('WITH COLON') },
				]),
				rewriteRules: {},
			});
		});

		afterAll(async () => {
			await server.close();
		});

		// Colons were stripped before decoding, so "/a:b.txt" silently served the
		// contents of "ab.txt" with a 200 — a different file than the one asked
		// for, with nothing to signal the substitution.
		it('does not silently resolve a colon path to a different file', async () => {
			const response = await server.get('/a:b.txt');
			expect(response.status).toBe(200);
			expect(response.text).toBe('WITH COLON');
		});

		it('treats an encoded colon identically to a literal one', async () => {
			const literal = await server.get('/a:b.txt');
			const encoded = await server.get('/a%3Ab.txt');

			expect(encoded.status).toBe(literal.status);
			expect(encoded.text).toBe(literal.text);
			expect(encoded.text).toBe('WITH COLON');
		});

		it('still serves a colon-free path unchanged', async () => {
			const response = await server.get('/ab.txt');
			expect(response.status).toBe(200);
			expect(response.text).toBe('WITHOUT COLON');
		});

		it('reports a missing colon path as not found instead of resolving elsewhere', async () => {
			const response = await server.get('/no:such.txt');
			expect(response.status).toBe(404);
		});
	});

	describe('compressed responses', () => {
		const content = Buffer.from(
			"Look again at that dot. That's here. That's home. That's us. On it everyone you love, everyone you know, everyone you ever heard of, every human being who ever was, lived out their lives.",
		);
		let server: MockedServer;

		beforeAll(async () => {
			const bucket = new MockedBucket([{ name: 'test.txt', content }]);
			server = await MockedServer.create({ bucket, returnRawBuffer: true });
		});

		afterAll(async () => {
			await server.close();
		});

		it('returns correct raw data', async () => {
			await check(undefined);
		});

		it('returns correct gzip data', async () => {
			await check('gzip');
		});

		it('returns correct br data', async () => {
			await check('br');
		});

		async function check(encoding: 'br' | 'gzip' | undefined): Promise<void> {
			const headers = { 'Accept-Encoding': encoding ?? 'identity' };

			const response = await server.get('/test.txt', headers);

			expect(response.status).toBe(200);
			expect(response.contentType).toBe('text/plain');
			expect(response.contentEncoding).toStrictEqual(encoding);

			expect(response.buffer).toStrictEqual(content);
			expect(response.contentLength).toStrictEqual(response.rawBuffer.length);

			if (encoding) {
				expect(response.buffer.length).not.toStrictEqual(response.rawBuffer.length);
			}
		}
	});

	describe('versatiles rewrite rule', () => {
		let server: MockedServer;

		beforeAll(async () => {
			const bucket = new MockedBucket([
				{
					name: 'download.versatiles.org/osm.versatiles',
					filename: resolve(basePath, 'testdata/island.versatiles'),
				},
			]);
			server = await MockedServer.create({
				bucket,
				rewriteRules: {
					'/tiles/osm/:args(.*)': '/download.versatiles.org/osm.versatiles\\?:args',
				},
			});
		});

		afterAll(async () => {
			await server.close();
		});

		it('serve meta.json via rewrite', async () => {
			const response = await server.get('/tiles/osm/meta.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"vector_layers"/);
			expect(response.contentType).toBe('application/json');
		});

		it('serve tiles.json via rewrite', async () => {
			const response = await server.get('/tiles/osm/tiles.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"vector_layers"/);
			expect(response.contentType).toBe('application/json');
		});

		it('serve style.json via rewrite', async () => {
			const response = await server.get('/tiles/osm/style.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"version":8/);
			expect(response.contentType).toBe('application/json');
		});

		it('serve preview via rewrite', async () => {
			const response = await server.get('/tiles/osm/preview');
			expect(response.status).toBe(200);
			// The HTML5 doctype is case-insensitive, so do not pin its casing.
			expect(response.text).toMatch(/^<!doctype html>/i);
			expect(response.contentType).toBe('text/html');
		});

		it('serve tile via rewrite', async () => {
			const response = await server.get('/tiles/osm/14/3740/4505');
			expect(response.status).toBe(200);
			expect(response.text).toContain('water_lines');
			expect(response.contentType).toBe('application/x-protobuf');
		});

		it('handle missing tile via rewrite', async () => {
			const response = await server.get('/tiles/osm/10/0/0');
			expect(response.status).toBe(204);
		});
	});

	describe('local directory mode', () => {
		let server: MockedServer;

		beforeAll(async () => {
			server = await MockedServer.create({ bucket: 'test-bucket', localDirectory: basePath });
		});

		afterAll(async () => {
			await server.close();
		});

		it('serve static file', async () => {
			const response = await server.get('/README.md');
			expect(response.status).toBe(200);
			expect(response.text).toBe(readFileSync(resolve(basePath, 'README.md'), 'utf8'));
			expect(response.contentType).toBe('text/markdown');
		});

		it('handle missing static file', async () => {
			const response = await server.get('/static/file');
			expect(response.status).toBe(404);
			expect(response.text).toBe('file "/static/file" not found');
			expect(response.contentType).toBe('text/plain');
		});

		it('serve versatiles meta', async () => {
			const response = await server.get('/testdata/island.versatiles?meta.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"vector_layers"/);
			expect(response.contentType).toBe('application/json');
		});

		it('serve versatiles style', async () => {
			const response = await server.get('/testdata/island.versatiles?style.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"version":8/);
			expect(response.contentType).toBe('application/json');
		});

		it('serve versatiles preview', async () => {
			const response = await server.get('/testdata/island.versatiles?preview');
			expect(response.status).toBe(200);
			// The HTML5 doctype is case-insensitive, so do not pin its casing.
			expect(response.text).toMatch(/^<!doctype html>/i);
			expect(response.contentType).toBe('text/html');
		});
	});
});
