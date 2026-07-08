import type { MockedResponse } from '../responder.mock.js';
import type { Response } from 'express';
import { createHash } from 'crypto';
import { Container } from '@versatiles/container';
import { defaultHeader } from '../response_headers.mock.js';
import { getMockedResponder } from '../responder.mock.js';
import { getVersatiles } from './cache.js';
import { it, describe, expect, vi } from 'vitest';
import { MockedBucketFile } from '../bucket/bucket.mock.js';
import { readFileSync } from 'fs';

const filename = new URL('../../../testdata/island.versatiles', import.meta.url).pathname;

vi.spyOn(console, 'error').mockReturnValue();

describe('VersaTiles', () => {
	describe('serve', () => {
		it('should handle preview request correctly', async () => {
			const html = readFileSync(
				new URL('../../../static/preview.html', import.meta.url).pathname,
				'utf8',
			);
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

		it('should handle missing tiles correctly', async () => {
			await checkError('?13/2870/2252', 204, 'no map tile at 13/2870/2252');
		});

		it('should handle wrong requests correctly', async () => {
			await checkError(
				'?bathtub',
				400,
				'get parameter must be "?preview", "?meta.json", "?tiles.json", "?style.json", or "?{z}/{x}/{y}"',
			);
		});

		it('should respond 500 when style.json generation fails on invalid metadata', async () => {
			// Build a fresh container (unique name to bypass the module cache) whose
			// metadata is not valid JSON, so sendStyle's JSON.parse throws.
			const spy = vi
				.spyOn(Container.prototype, 'getMetadata')
				.mockResolvedValue('this is not json');
			const mockFile = new MockedBucketFile({ name: 'broken-meta.versatiles', filename });
			const versatiles = await getVersatiles(mockFile, 'https://example.org/data/map.versatiles');
			spy.mockRestore();

			const responder = getMockedResponder({ fastRecompression: true });
			await versatiles.serve('?style.json', responder);

			expect(responder.response.writeHead).toHaveBeenCalledWith(500, {
				'content-type': 'text/plain',
			});
			const endMock = vi.mocked(responder.response.end);
			expect(endMock).toHaveBeenCalledTimes(1);
			// Client gets a generic message; internal details are not leaked.
			expect(String(endMock.mock.calls[0][0])).toBe('internal server error');
		});

		async function runQuery(query: string): Promise<MockedResponse> {
			const mockFile = new MockedBucketFile({ name: 'osm.versatiles', filename });

			const versatiles = await getVersatiles(mockFile, 'https://example.org/data/map.versatiles');

			const mockResponder = getMockedResponder({
				fastRecompression: true,
				requestHeaders: { 'accept-encoding': 'gzip, br' },
				requestNo: 5,
				verbose: false,
			});

			await versatiles.serve(query, mockResponder);

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
