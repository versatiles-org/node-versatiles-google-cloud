/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/naming-convention */
import type { AbstractBucketFile } from '../bucket/index.js';
import type { Format, Header } from '@versatiles/container';
import type { MockedResponder, MockedResponse } from '../responder.mock.test.js';
import type { Response } from 'express';
import { Container } from '@versatiles/container';
import { createHash } from 'crypto';
import { getMockedResponder } from '../responder.mock.test.js';
import { jest } from '@jest/globals';
import { MockedBucketFile } from '../bucket/bucket.mock.test.js';
import { readFileSync } from 'fs';
import { getVersatiles } from './cache.js';
import type { Versatiles } from './versatiles.js';

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
			requestHeaders: {
				'accept-encoding': 'gzip, br',
			},
			requestNo: 5,
			verbose: false,
		});
	});
	describe('serve', () => {
		it('should handle preview request correctly', async () => {
			const html = readFileSync(new URL('../../../static/preview.html', import.meta.url).pathname, 'utf8');
			await versatiles.serve('preview', mockResponder);

			checkResponse(200, html, {
				'cache-control': 'max-age=86400',
				'content-length': '' + html.length,
				'content-type': 'text/html',
				'vary': 'accept-encoding',
			});
		});

		it('should handle meta.json request correctly', async () => {
			await versatiles.serve('meta.json', mockResponder);

			checkResponse(200, '{"vector_layers":[{"id":"place_labels"', {
				'cache-control': 'max-age=86400',
				'content-type': 'application/json',
				'vary': 'accept-encoding',
			});
		});

		it('should handle style.json request correctly', async () => {
			await versatiles.serve('style.json', mockResponder);

			checkResponse(200, '{"version":8,"name":"versatiles-colorful",', {
				'cache-control': 'max-age=86400',
				'content-type': 'application/json',
				'vary': 'accept-encoding',
			});
		});

		it('should handle tile data request correctly', async () => {
			await versatiles.serve('tiles/13/1870/2252', mockResponder);

			checkResponse(200, '9bf3b76efbf8c96e', {
				'cache-control': 'max-age=86400',
				'content-encoding': 'br',
				'content-type': 'application/x-protobuf',
				'vary': 'accept-encoding',
			});
		});

		it('should handle missing tiles correctly', async () => {
			await versatiles.serve('tiles/13/2870/2252', mockResponder);

			checkError(204, 'no map tile at 13/2870/2252');
		});

		it('should handle wrong requests correctly', async () => {
			await versatiles.serve('bathtub', mockResponder);

			checkError(400, 'get parameter must be "?preview", "?meta.json", "?style.json", or "?tiles/{z}/{x}/{y}"');
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

	describe('test style generation', () => {
		it('handles jpeg', async () => {
			const responder = prepareTest('jpg');
			await versatiles.serve('style.json', responder);
			checkResponse(responder, '"type":"raster","format":"jpg"', 287);
		});

		it('handles webp', async () => {
			const responder = prepareTest('webp');
			await versatiles.serve('style.json', responder);
			checkResponse(responder, '"type":"raster","format":"webp"', 288);
		});

		it('handles png', async () => {
			const responder = prepareTest('png');
			await versatiles.serve('style.json', responder);
			checkResponse(responder, '"type":"raster","format":"png"', 287);
		});

		it('handles avif', async () => {
			const responder = prepareTest('avif');
			await versatiles.serve('style.json', responder);
			checkResponse(responder, '"type":"raster","format":"avif"', 288);
		});



		it('error on pbf without metadata', async () => {
			const responder = prepareTest('pbf', undefined);
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: Expected an array of layers');
		});

		it('error on pbf corrupt metadata 1', async () => {
			const responder = prepareTest('pbf', ':');
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: Expected an array of layers');
		});

		it('error on pbf corrupt metadata 2', async () => {
			const responder = prepareTest('pbf', '2');
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: Expected an array of layers');
		});

		it('error on pbf with empty metadata', async () => {
			const responder = prepareTest('pbf', '{}');
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: Expected an array of layers');
		});

		it('error on pbf with wrong vector_layers', async () => {
			const responder = prepareTest('pbf', '{"vector_layers":2}');
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: Expected an array of layers');
		});

		it('error on pbf with empty vector_layers', async () => {
			const responder = prepareTest('pbf', '{"vector_layers":[]}');
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: Array of layers cannot be empty');
		});

		it('handles pbf with correct metadata', async () => {
			const responder = prepareTest('pbf', JSON.stringify({ vector_layers: [{ id: 'geometry', fields: { label: 'String', height: 'Number' } }] }));
			await versatiles.serve('style.json', responder);
			checkResponse(responder, '"type":"vector","format":"pbf"', 1085);
		});



		it('error on bin', async () => {
			const responder = prepareTest('bin');
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: format "bin" is not supported');
		});

		it('error on geojson', async () => {
			const responder = prepareTest('geojson');
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: format "geojson" is not supported');
		});

		it('error on json', async () => {
			const responder = prepareTest('json');
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: format "json" is not supported');
		});

		it('error on svg', async () => {
			const responder = prepareTest('svg');
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: format "svg" is not supported');
		});

		it('error on topojson', async () => {
			const responder = prepareTest('topojson');
			await versatiles.serve('style.json', responder);
			await checkError(responder, 'server side error: format "topojson" is not supported');
		});

		function checkResponse(responder: MockedResponder, content: string, length: number): void {
			const headers: unknown = {
				'cache-control': 'max-age=86400',
				'content-length': String(length),
				'content-type': 'application/json',
				'vary': 'accept-encoding',
			};
			const response: MockedResponse = responder.response;

			expect(response.writeHead).toHaveBeenCalledTimes(1);
			expect(response.writeHead).toHaveBeenCalledWith(200, headers);

			expect(response.end).toHaveBeenCalledTimes(1);
			const buffer = response.getBuffer();
			expect(buffer.length).toBe(length);

			if (content.length === 16) {
				const hasher = createHash('sha256');
				hasher.update(buffer);
				expect(hasher.digest('hex').slice(0, 16)).toBe(content);
			} else {
				expect(buffer.toString()).toContain(content);
			}
		}

		async function checkError(responder: MockedResponder, content: string): Promise<void> {
			const response: MockedResponse = responder.response;

			expect(response.writeHead).toHaveBeenCalledTimes(1);
			expect(response.writeHead).toHaveBeenCalledWith(500, { 'content-type': 'text/plain' });

			expect(response.end).toHaveBeenCalledTimes(1);
			expect(response.end).toHaveBeenCalledWith(content);

			await new Promise(res => setTimeout(res, 10));
		}

		function prepareTest(tileFormat: Format, metadata?: string): MockedResponder {
			// eslint-disable-next-line @typescript-eslint/require-await
			jest.spyOn(Container.prototype, 'getHeader').mockImplementation(async (): Promise<Header> => ({
				magic: 'string',
				version: 'string',
				tileFormat,
				tileMime: '',
				tileCompression: 'raw',
				zoomMin: 0,
				zoomMax: 0,
				bbox: [0, 0, 0, 0],
				metaOffset: 0,
				metaLength: 0,
				blockIndexOffset: 0,
				blockIndexLength: 0,
			}));

			// eslint-disable-next-line @typescript-eslint/require-await
			jest.spyOn(Container.prototype, 'getMetadata').mockImplementation(async (): Promise<string | undefined> => metadata);

			return getMockedResponder({
				fastRecompression: true,
				requestHeaders: {
					'accept-encoding': 'gzip, br',
				},
				requestNo: 5,
				verbose: false,
			});
		}
	});

});
