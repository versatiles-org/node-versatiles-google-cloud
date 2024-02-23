/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/naming-convention */
import type { AbstractBucketFile } from './bucket';
import type { Format, Header } from '@versatiles/container';
import type { MockedResponder, MockedResponse } from './responder.mock.test';
import type { Response } from 'express';
import { Container } from '@versatiles/container';
import { createHash } from 'crypto';
import { getMockedResponder } from './responder.mock.test';
import { jest } from '@jest/globals';
import { MockedBucketFile } from './bucket/bucket.mock.test';
import { readFileSync } from 'fs';
import { serveVersatiles } from './versatiles';

jest.mock('@google-cloud/storage');
jest.mock('@versatiles/container');
jest.mock('node:fs/promises');
jest.mock('@versatiles/style');

describe('serve VersaTiles', () => {
	const filename = new URL('../../testdata/island.versatiles', import.meta.url).pathname;
	let mockFile: AbstractBucketFile;
	let mockResponder: MockedResponder;

	beforeEach(() => {
		mockFile = new MockedBucketFile(['osm.versatiles', filename]);

		mockResponder = getMockedResponder({
			fastRecompression: true,
			requestHeaders: {
				'accept-encoding': 'gzip, br',
			},
			requestNo: 5,
			verbose: false,
		});
	});

	it('should handle preview request correctly', async () => {
		const html = readFileSync(new URL('../../static/preview.html', import.meta.url).pathname, 'utf8');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'preview', mockResponder);

		checkResponse(200, html, {
			'cache-control': 'max-age=86400',
			'content-length': '' + html.length,
			'content-type': 'text/html',
			'vary': 'accept-encoding',
		});
	});

	it('should handle meta.json request correctly', async () => {
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'meta.json', mockResponder);

		checkResponse(200, '{"vector_layers":[{"id":"place_labels"', {
			'cache-control': 'max-age=86400',
			'content-type': 'application/json',
			'vary': 'accept-encoding',
		});
	});

	it('should handle style.json request correctly', async () => {
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', mockResponder);

		checkResponse(200, '{"version":8,"name":"versatiles-colorful",', {
			'cache-control': 'max-age=86400',
			'content-type': 'application/json',
			'vary': 'accept-encoding',
		});
	});

	it('should handle tile data request correctly', async () => {
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'tiles/13/1870/2252', mockResponder);

		checkResponse(200, '9bf3b76efbf8c96e', {
			'cache-control': 'max-age=86400',
			'content-encoding': 'br',
			'content-type': 'application/x-protobuf',
			'vary': 'accept-encoding',
		});
	});

	it('should handle missing tiles correctly', async () => {
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'tiles/13/2870/2252', mockResponder);

		checkError(204, 'no map tile at 13/2870/2252');
	});

	it('should handle wrong requests correctly', async () => {
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'bathtub', mockResponder);

		checkError(400, 'get parameter must be "meta.json", "style.json", or "tile/{z}/{x}/{y}"');
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
	let mockFile: AbstractBucketFile;

	beforeEach(() => {
		mockFile = new MockedBucketFile([Date.now() + '.versatiles', '?']);
	});

	it('handles jpeg', async () => {
		const responder = prepareTest('jpeg');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		checkResponse(responder, '"type":"raster","format":"jpg"', 282);
	});

	it('handles webp', async () => {
		const responder = prepareTest('webp');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		checkResponse(responder, '"type":"raster","format":"webp"', 283);
	});

	it('handles png', async () => {
		const responder = prepareTest('png');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		checkResponse(responder, '"type":"raster","format":"png"', 282);
	});

	it('handles avif', async () => {
		const responder = prepareTest('avif');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		checkResponse(responder, '"type":"raster","format":"avif"', 283);
	});



	it('error on pbf without metadata', async () => {
		const responder = prepareTest('pbf', undefined);
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'metadata must be defined');
	});

	it('error on pbf corrupt metadata 1', async () => {
		const responder = prepareTest('pbf', ':');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'metadata must be defined');
	});

	it('error on pbf corrupt metadata 2', async () => {
		const responder = prepareTest('pbf', '2');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'metadata must be an object');
	});

	it('error on pbf with empty metadata', async () => {
		const responder = prepareTest('pbf', '{}');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'metadata must contain property vector_layers');
	});

	it('error on pbf with wrong vector_layers', async () => {
		const responder = prepareTest('pbf', '{"vector_layers":2}');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'metadata.vector_layers must be an array');
	});

	it('error on pbf with empty vector_layers', async () => {
		const responder = prepareTest('pbf', '{"vector_layers":[]}');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'style can not be guessed based on metadata');
	});

	it('handles pbf with correct metadata', async () => {
		const responder = prepareTest('pbf', JSON.stringify({ vector_layers: [{ id: 'geometry', fields: { label: 'String', height: 'Number' } }] }));
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		checkResponse(responder, '"type":"vector","format":"pbf"', 1080);
	});



	it('error on bin', async () => {
		const responder = prepareTest('bin');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'tile format "bin" is not supported');
	});

	it('error on geojson', async () => {
		const responder = prepareTest('geojson');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'tile format "geojson" is not supported');
	});

	it('error on json', async () => {
		const responder = prepareTest('json');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'tile format "json" is not supported');
	});

	it('error on svg', async () => {
		const responder = prepareTest('svg');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'tile format "svg" is not supported');
	});

	it('error on topojson', async () => {
		const responder = prepareTest('topojson');
		await serveVersatiles(mockFile, 'https://example.com/osm.versatiles', 'style.json', responder);
		await checkError(responder, 'tile format "topojson" is not supported');
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


