/* eslint-disable @typescript-eslint/naming-convention */
import Request from 'supertest';
import express from 'express';
import { startServer } from './server';
import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import type Test from 'supertest/lib/test';
import { resolve } from 'path';
import { MockedBucket } from './bucket/bucket.mock.test';
import type { AbstractBucket } from './bucket';
import type TestAgent from 'supertest/lib/agent';
import type { Server } from 'http';

jest.spyOn(console, 'log').mockReturnValue();
jest.mock('express', () => express); // Mock express
jest.mock('@google-cloud/storage'); // Mock Google Cloud Storage

const basePath = new URL('../../', import.meta.url).pathname;

class MockedServer {
	readonly #opt: MockedServerOptions;

	readonly #bucket: AbstractBucket | string;

	#request?: TestAgent<Request.Test>;

	#server?: Server;

	private constructor(opt?: MockedServerOptions) {
		this.#opt = opt ?? {};

		if (this.#opt.bucket != null) {
			this.#bucket = this.#opt.bucket;
	} else {
			this.#bucket = new MockedBucket([
				{ name: 'static/package.json', filename: resolve(basePath, 'package.json') },
				{ name: 'geodata/test.versatiles', filename: resolve(basePath, 'testdata/island.versatiles') },
		]);
	}
	}

	public static async create(opt?: MockedServerOptions): Promise<MockedServer> {
		const me = new MockedServer(opt);

		const port = me.#opt.port ?? 0;
	const server = await startServer({
			baseUrl: 'http://localhost:' + port,
			bucket: me.#bucket,
		bucketPrefix: '',
		fastRecompression: false,
		verbose: false,
			localDirectory: me.#opt.localDirectory,
			port,
	});

	if (server == null) throw Error();

		me.#request = Request(server);
		me.#server = server;

		return me;
	}

	public async get(url: string, header?: Record<string, string>): Promise<Test> {
		if (this.#request === undefined) throw Error();
		if (header) {
			return this.#request.get(url).set(header);
		} else {
			return this.#request.get(url);
		}
	}

	public async close(): Promise<void> {
		const server = this.#server;
		if (server === undefined) throw Error();
		await new Promise<void>(res => server.close(() => {
				res();
			}));
		return;
	}
}

interface MockedServerOptions {
	bucket?: MockedBucket | string;
	localDirectory?: string;
	port?: number;
}


describe('Server Tests', () => {

	describe('simple server tests', () => {
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
			server = await MockedServer.create({ bucket: 'test-bucket', localDirectory: basePath });
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
