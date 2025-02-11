import type { AbstractBucketFile } from '../bucket/index.js';
import type { MockedResponder, MockedResponse } from '../responder.mock.test.js';
import type { Response } from 'express';
import type { Versatiles } from './versatiles.js';
import { createHash } from 'node:crypto';
import { defaultHeader } from '../response_headers.mock.test.js';
import { getMockedResponder } from '../responder.mock.test.js';
import { getVersatiles } from './cache.js';
import { jest } from '@jest/globals';
import { MockedBucketFile } from '../bucket/bucket.mock.test.js';
import { readFileSync } from 'node:fs';

jest.mock('@google-cloud/storage');
jest.mock('@versatiles/container');
jest.mock('node:fs/promises');
jest.mock('@versatiles/style');

const filename = new URL('../../../testdata/island.versatiles', import.meta.url).pathname;

describe('VersaTiles', () => {
	let mockFile: AbstractBucketFile;
	let mockResponder: MockedResponder;
	let versatiles: Versatiles;

	beforeEach(async () => {
		mockFile = new MockedBucketFile({ name: 'osm.versatiles', filename });

		versatiles = await getVersatiles(mockFile, 'https://example.org/data/map.versatiles');

		mockResponder = getMockedResponder({
			fastRecompression: true,
			requestHeaders: { 'accept-encoding': 'gzip, br' },
			requestNo: 5,
			verbose: false,
		});
	});

	describe('serve', () => {
		it('should handle preview request correctly', async () => {
			const html = readFileSync(new URL('../../../static/preview.html', import.meta.url).pathname, 'utf8');
			await versatiles.serve('?preview', mockResponder);

			checkResponse(200, html, {
				...defaultHeader,
				'content-length': '' + html.length,
				'content-type': 'text/html',
			});
		});

		it('should handle meta.json request correctly', async () => {
			await versatiles.serve('?meta.json', mockResponder);

			checkResponse(200, '{"vector_layers":[{"id":"place_labels"', {
				...defaultHeader,
				'content-type': 'application/json',
			});
		});

		it('should handle style.json request correctly', async () => {
			await versatiles.serve('?style.json', mockResponder);

			checkResponse(200, '{"version":8,"name":"versatiles-colorful",', {
				...defaultHeader,
				'content-type': 'application/json',
			});
		});

		it('should handle tile data request correctly', async () => {
			await versatiles.serve('?13/1870/2252', mockResponder);

			checkResponse(200, '9bf3b76efbf8c96e', {
				...defaultHeader,
				'content-encoding': 'br',
				'content-type': 'application/x-protobuf',
			});
		});

		it('should handle missing tiles correctly', async () => {
			await versatiles.serve('?13/2870/2252', mockResponder);

			checkError(204, 'no map tile at 13/2870/2252');
		});

		it('should handle wrong requests correctly', async () => {
			await versatiles.serve('?bathtub', mockResponder);

			checkError(400, 'get parameter must be "?preview", "?meta.json", "?style.json", or "?{z}/{x}/{y}"');
		});

		function checkResponse(status: number, content: string, headers: unknown): void {
			const response: MockedResponse = mockResponder.response;

			expect(response.writeHead).toHaveBeenCalledTimes(1);
			expect(response.writeHead).toHaveBeenCalledWith(status, expect.objectContaining(headers));

			expect(response.end).toHaveBeenCalledTimes(1);
			const buffer = response.getBuffer();
			if (content.length === 16) {
				const hasher = createHash('sha256');
				hasher.update(buffer);
				expect(hasher.digest('hex').slice(0, 16)).toBe(content);
			} else {
				expect(buffer.toString()).toContain(content);
			}
		}

		function checkError(status: number, message: string): void {
			const response: Response = mockResponder.response;

			expect(response.writeHead).toHaveBeenCalledTimes(1);
			expect(response.writeHead).toHaveBeenCalledWith(status, { 'content-type': 'text/plain' });

			expect(response.end).toHaveBeenCalledTimes(1);
			expect(response.end).toHaveBeenCalledWith(message);
		}
	});

});
