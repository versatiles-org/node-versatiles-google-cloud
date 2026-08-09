import type { MockedResponse } from '../responder.mock.js';
import type { Response } from 'express';
import { createHash } from 'crypto';
import { Container } from '@versatiles/container';
import { defaultHeader } from '../response_headers.mock.js';
import { getMockedResponder } from '../responder.mock.js';
import { ContainerCache } from './cache.js';
import { it, describe, expect, vi } from 'vitest';
import { MockedBucketFile } from '../bucket/bucket.mock.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// fileURLToPath, not .pathname: the latter is percent-encoded, so any path
// component containing a space (or other encoded character) would not resolve.
const filename = fileURLToPath(new URL('../../../testdata/island.versatiles', import.meta.url));

vi.spyOn(console, 'error').mockReturnValue();

describe('VersaTiles', () => {
	describe('serve', () => {
		it('should handle preview request correctly', async () => {
			const html = readFileSync(new URL('../../../static/preview.html', import.meta.url), 'utf8');
			checkResponse('?preview', 200, html, {
				...defaultHeader,
				'content-length': '' + html.length,
				'content-type': 'text/html',
			});
		});

		it('should handle meta.json request correctly', async () => {
			await checkResponse('?meta.json', 200, '{"vector_layers":[{"id":"place_labels"', {
				...defaultHeader,
				'content-type': 'application/json',
			});
		});

		it('should handle tiles.json as alias for meta.json', async () => {
			await checkResponse('?tiles.json', 200, '{"vector_layers":[{"id":"place_labels"', {
				...defaultHeader,
				'content-type': 'application/json',
			});
		});

		it('should handle style.json request correctly', async () => {
			await checkResponse('?style.json', 200, '{"version":8,"name":"versatiles-colorful",', {
				...defaultHeader,
				'content-type': 'application/json',
			});
		});

		it('should handle tile data request correctly', async () => {
			await checkResponse('?13/1870/2252', 200, '9bf3b76efbf8c96e', {
				...defaultHeader,
				'content-encoding': 'br',
				'content-type': 'application/x-protobuf',
			});
		});

		// A 204 must carry neither a body nor a content-type. Previously this went
		// through error(), which declared "content-type: text/plain" and passed a
		// message that Node then discarded — so the message never reached the
		// client despite the code appearing to send it.
		it('should answer a missing tile with a bodiless 204', async () => {
			const response: MockedResponse = await runQuery('?13/2870/2252');

			expect(response.writeHead).toHaveBeenCalledTimes(1);

			const [status, headers] = vi.mocked(response.writeHead).mock.calls[0] as [
				number,
				Record<string, string>,
			];

			expect(status).toBe(204);
			expect(headers['content-type']).toBeUndefined();
			expect(headers['content-length']).toBeUndefined();
			expect(headers['content-encoding']).toBeUndefined();

			expect(response.end).toHaveBeenCalledTimes(1);
			expect(response.end).toHaveBeenCalledWith();
		});

		// Without a validator the client has nothing to revalidate with, so the
		// if-none-match check above could never fire; without cache-control a CDN
		// re-asks the origin for every absent tile, of which a sparse container has
		// far more than present ones.
		it('should let a missing tile be cached and revalidated', async () => {
			const response: MockedResponse = await runQuery('?13/2870/2252');

			const [, headers] = vi.mocked(response.writeHead).mock.calls[0] as [
				number,
				Record<string, string>,
			];

			expect(headers).toMatchObject({
				'cache-control': 'max-age=86400',
				etag: expect.stringMatching(/^"/) as unknown as string,
				vary: 'accept-encoding',
			});
		});

		it('should answer 304 when the client already holds a missing tile', async () => {
			const first: MockedResponse = await runQuery('?13/2870/2252');
			const [, headers] = vi.mocked(first.writeHead).mock.calls[0] as [
				number,
				Record<string, string>,
			];

			const second = await runQuery('?13/2870/2252', { 'if-none-match': headers.etag });

			expect(second.writeHead).toHaveBeenCalledWith(304, expect.anything());
		});

		// The coordinate pattern was only anchored at the start, so anything after
		// the coordinates was ignored and "?13/1870/2252<anything>" returned the
		// same tile. Behind a CDN that is an unbounded set of cache keys for one
		// response.
		it('should reject trailing characters after tile coordinates', async () => {
			const message =
				'get parameter must be "?preview", "?meta.json", "?tiles.json", "?style.json", or "?{z}/{x}/{y}"';

			for (const query of [
				'?13/1870/2252junk',
				'?13/1870/2252/99',
				'?13/1870/2252.',
				'?13/1870/2252-',
			]) {
				await checkError(query, 400, message);
			}
		});

		// parseInt discards leading zeros, so "\d+" let unboundedly many spellings
		// address one tile: "?13/1870/2252", "?013/1870/2252", "?0013/..." and so
		// on. Behind a CDN each is its own cache key for identical bytes.
		it('should reject leading zeros in tile coordinates', async () => {
			const message =
				'get parameter must be "?preview", "?meta.json", "?tiles.json", "?style.json", or "?{z}/{x}/{y}"';

			for (const query of [
				'?013/1870/2252',
				'?0013/1870/2252',
				'?13/01870/2252',
				'?13/1870/02252',
				'?00/0/0',
			]) {
				await checkError(query, 400, message);
			}
		});

		it('should still accept a zero coordinate', async () => {
			// "0" is a legitimate coordinate; only redundant zeros are rejected.
			const response = await runQuery('?0/0/0');
			expect(response.writeHead).toHaveBeenCalledWith(204, expect.anything());
		});

		// Everything a container serves is determined by its revision plus what was
		// asked for, so each response carries a validator and can be revalidated
		// without transferring the body again.
		describe('validators', () => {
			const etagOf = async (query: string): Promise<string> => {
				const response = await runQuery(query);
				const [, headers] = vi.mocked(response.writeHead).mock.calls[0] as [
					number,
					Record<string, string>,
				];
				return headers.etag;
			};

			it('sends an etag for every kind of container response', async () => {
				for (const query of ['?13/1870/2252', '?meta.json', '?style.json', '?preview']) {
					expect(await etagOf(query), query).toMatch(/^".+"$/);
				}
			});

			it('gives different tiles different validators', async () => {
				expect(await etagOf('?13/1870/2252')).not.toBe(await etagOf('?8/58/70'));
			});

			it('gives each response kind its own validator', async () => {
				const tags = await Promise.all(['?13/1870/2252', '?meta.json', '?style.json'].map(etagOf));
				expect(new Set(tags).size).toBe(tags.length);
			});

			it('answers 304 when the client already holds the tile', async () => {
				const etag = await etagOf('?13/1870/2252');
				const response = await runQuery('?13/1870/2252', { 'if-none-match': etag });

				// A 304 keeps the validator and caching headers, unlike a bodiless 204.
				expect(response.writeHead).toHaveBeenCalledWith(304, expect.objectContaining({ etag }));
				expect(response.getBuffer().length).toBe(0);
			});

			it('omits body headers from a 304', async () => {
				const etag = await etagOf('?13/1870/2252');
				const response = await runQuery('?13/1870/2252', { 'if-none-match': etag });

				const [, headers] = vi.mocked(response.writeHead).mock.calls[0] as [
					number,
					Record<string, string>,
				];
				expect(headers['content-type']).toBeUndefined();
				expect(headers['content-length']).toBeUndefined();
				expect(headers['content-encoding']).toBeUndefined();
			});

			// The validator is known before the tile is read, so a client that still
			// holds the tile costs no bucket read at all.
			it('does not read the tile when answering 304', async () => {
				const etag = await etagOf('?13/1870/2252');
				const spy = vi.spyOn(Container.prototype, 'getTile');

				await runQuery('?13/1870/2252', { 'if-none-match': etag });

				expect(spy).not.toHaveBeenCalled();
				spy.mockRestore();
			});

			it('serves the body when the validator does not match', async () => {
				const response = await runQuery('?13/1870/2252', { 'if-none-match': '"stale"' });

				expect(response.writeHead).toHaveBeenCalledWith(200, expect.anything());
				expect(response.getBuffer().length).toBeGreaterThan(0);
			});
		});

		it('should handle wrong requests correctly', async () => {
			await checkError(
				'?bathtub',
				400,
				'get parameter must be "?preview", "?meta.json", "?tiles.json", "?style.json", or "?{z}/{x}/{y}"',
			);
		});

		it('should respond 500 when style.json generation fails on invalid metadata', async () => {
			// Build a container whose metadata is not valid JSON, so sendStyle's
			// JSON.parse throws.
			const spy = vi
				.spyOn(Container.prototype, 'getMetadata')
				.mockResolvedValue('this is not json');
			const mockFile = new MockedBucketFile({ name: 'osm.versatiles', filename });
			const versatiles = await new ContainerCache().getVersatiles(mockFile);
			spy.mockRestore();

			const responder = getMockedResponder({ fastRecompression: true });
			await versatiles.serve('?style.json', 'https://example.org/data/map.versatiles', responder);

			expect(responder.response.writeHead).toHaveBeenCalledWith(500, {
				'content-type': 'text/plain',
			});
			const endMock = vi.mocked(responder.response.end);
			expect(endMock).toHaveBeenCalledTimes(1);
			// Client gets a generic message; internal details are not leaked.
			expect(String(endMock.mock.calls[0][0])).toBe('internal server error');
		});

		async function runQuery(
			query: string,
			extraHeaders: Record<string, string> = {},
		): Promise<MockedResponse> {
			const mockFile = new MockedBucketFile({ name: 'osm.versatiles', filename });

			const versatiles = await new ContainerCache().getVersatiles(mockFile);

			const mockResponder = getMockedResponder({
				fastRecompression: true,
				requestHeaders: { 'accept-encoding': 'gzip, br', ...extraHeaders },
				requestNo: 5,
				verbose: false,
			});

			await versatiles.serve(query, 'https://example.org/data/map.versatiles', mockResponder);

			return mockResponder.response;
		}

		async function checkResponse(
			query: string,
			status: number,
			expectedContent: string,
			headers: unknown,
		): Promise<void> {
			const response: MockedResponse = await runQuery(query);

			expect(response.writeHead).toHaveBeenCalledTimes(1);
			expect(response.writeHead).toHaveBeenCalledWith(status, expect.objectContaining(headers));

			expect(response.end).toHaveBeenCalledTimes(1);
			const buffer = response.getBuffer();
			if (expectedContent.length === 16) {
				const hasher = createHash('sha256');
				hasher.update(buffer);
				expect(hasher.digest('hex').slice(0, 16)).toBe(expectedContent);
			} else {
				expect(buffer.toString()).toContain(expectedContent);
			}
		}

		async function checkError(query: string, status: number, message: string): Promise<void> {
			const response: Response = await runQuery(query);

			expect(response.writeHead).toHaveBeenCalledTimes(1);
			expect(response.writeHead).toHaveBeenCalledWith(status, { 'content-type': 'text/plain' });

			expect(response.end).toHaveBeenCalledTimes(1);
			expect(response.end).toHaveBeenCalledWith(message);
		}
	});
});
