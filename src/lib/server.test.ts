import Request from 'supertest';
import express from 'express';
import { startServer } from './server';
import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import type Test from 'supertest/lib/test';
import { resolve } from 'path';
import { MockedBucket } from './bucket/bucket.mock.test';
import type { AbstractBucket } from './bucket';

jest.spyOn(console, 'log').mockReturnValue();
jest.mock('express', () => express); // Mock express
jest.mock('@google-cloud/storage'); // Mock Google Cloud Storage

const basePath = new URL('../../', import.meta.url).pathname;

interface MockedServer {
	get: (url: string) => Promise<Test>;
	close: () => Promise<void>;
}

interface MockedServerOptions {
	bucket?: string;
	localDirectory?: string;
	port?: number;
}

async function getMockedServer(opt?: MockedServerOptions): Promise<MockedServer> {
	opt ??= {};
	opt.port ??= 8089;

	let bucket: AbstractBucket | string;

	if (opt.bucket != null) {
		({ bucket } = opt);
	} else {
		bucket = new MockedBucket([
			['static/package.json', resolve(basePath, 'package.json')],
			['geodata/test.versatiles', resolve(basePath, 'testdata/island.versatiles')],
		]);
	}

	const server = await startServer({
		baseUrl: 'http://localhost:' + opt.port,
		bucket,
		bucketPrefix: '',
		fastRecompression: false,
		verbose: false,
		localDirectory: opt.localDirectory,
		port: opt.port,
	});

	if (server == null) throw Error();

	const request = Request(server);

	return {
		get: async (url: string): Promise<Test> => {
			return request.get(url);
		},

		close: async (): Promise<void> => {
			return new Promise(res => server.close(() => {
				res();
			}));
		},
	};
}



describe('Server Tests', () => {

	describe('simple server tests', () => {
		let server: MockedServer;

		beforeAll(async () => {
			server = await getMockedServer();
		});

		afterAll(async () => {
			await server.close();
		});

		it('health check endpoint', async () => {
			const response = await server.get('/healthcheck');
			expect(response.status).toBe(200);
			expect(response.text).toBe('ok');
			expect(response.type).toBe('text/plain');
		});

		it('serve static file', async () => {
			const response = await server.get('/static/package.json');
			expect(response.status).toBe(200);
			expect(response.body).toMatchObject({ name: '@versatiles/google-cloud' });
			expect(response.type).toBe('application/json');
		});

		it('serve versatiles meta', async () => {
			const response = await server.get('/geodata/test.versatiles?meta.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"vector_layers"/);
			expect(response.type).toBe('application/json');
		});

		it('serve versatiles style', async () => {
			const response = await server.get('/geodata/test.versatiles?style.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"version":8/);
			expect(response.type).toBe('application/json');
		});

		it('serve versatiles preview', async () => {
			const response = await server.get('/geodata/test.versatiles?preview');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^<!DOCTYPE html>/);
			expect(response.type).toBe('text/html');
		});

		it('serve versatiles tile', async () => {
			const response = await server.get('/geodata/test.versatiles?tiles/14/3740/4505');
			expect(response.status).toBe(200);
			expect(response.text).toContain('water_lines');
			expect(response.type).toBe('application/x-protobuf');
		});

		it('handle missing versatiles tile', async () => {
			const response = await server.get('/geodata/test.versatiles?tiles/10/0/0');
			expect(response.status).toBe(204);
			expect(response.text).toBe('');
			expect(response.type).toBe('text/plain');
		});

		it('handle missing static file', async () => {
			const response = await server.get('/static/missing/file');
			expect(response.status).toBe(404);
			expect(response.text).toBe('file "static/missing/file" not found');
			expect(response.type).toBe('text/plain');
		});

		it('handle wrong versatiles request', async () => {
			const response = await server.get('/geodata/test.versatiles?everest');
			expect(response.status).toBe(400);
			expect(response.text).toBe('get parameter must be "?preview", "?meta.json", "?style.json", or "?tile/{z}/{x}/{y}"');
			expect(response.type).toBe('text/plain');
		});
	});

	describe('local directory mode', () => {
		let server: MockedServer;

		beforeAll(async () => {
			server = await getMockedServer({ bucket: 'test-bucket', localDirectory: basePath });
		});

		afterAll(async () => {
			await server.close();
		});

		it('serve static file', async () => {
			const response = await server.get('/README.md');
			expect(response.status).toBe(200);
			expect(response.text).toBe(readFileSync(resolve(basePath, 'README.md'), 'utf8'));
			expect(response.type).toBe('text/markdown');
		});

		it('handle missing static file', async () => {
			const response = await server.get('/static/file');
			expect(response.status).toBe(404);
			expect(response.text).toBe('file "static/file" not found');
			expect(response.type).toBe('text/plain');
		});

		it('serve versatiles meta', async () => {
			const response = await server.get('/testdata/island.versatiles?meta.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"vector_layers"/);
			expect(response.type).toBe('application/json');
		});

		it('serve versatiles style', async () => {
			const response = await server.get('/testdata/island.versatiles?style.json');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^{"version":8/);
			expect(response.type).toBe('application/json');
		});

		it('serve versatiles preview', async () => {
			const response = await server.get('/testdata/island.versatiles?preview');
			expect(response.status).toBe(200);
			expect(response.text).toMatch(/^<!DOCTYPE html>/);
			expect(response.type).toBe('text/html');
		});
	});
});
