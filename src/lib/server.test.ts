import { jest } from '@jest/globals';
import { MockedBucket } from './bucket/bucket.mock.test';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { startServer } from './server';
import express from 'express';
import request from 'supertest';
import type { AbstractBucket } from './bucket';
import type { Server, ServerResponse } from 'http';
import type Test from 'supertest/lib/test';
import type TestAgent from 'supertest/lib/agent';
import { brotliDecompressSync, gunzipSync } from 'zlib';

//jest.spyOn(console, 'log').mockReturnValue();
jest.mock('express', () => express); // Mock express
jest.mock('@google-cloud/storage'); // Mock Google Cloud Storage

const basePath = new URL('../../', import.meta.url).pathname;



interface MockedServerOptions {
	bucket?: MockedBucket | string;
	localDirectory?: string;
	port?: number;
	returnRawBuffer?: boolean;
}

class MockedServer {
	readonly #opt: MockedServerOptions;

	readonly #bucket: AbstractBucket | string;

	#request?: TestAgent<request.Test>;

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

		const agent = request.agent(server);
		if (me.#opt.returnRawBuffer === true) {
			agent.buffer(true);
			agent.parse((res: ServerResponse, next: (error: null, result: Buffer) => void) => {
				const data: Buffer[] = [];
				res.on('data', (chunk: Buffer) => {
					data.push(chunk);
				});
				res.on('end', () => {
					next(null, Buffer.concat(data));
				});
			});
		}
		me.#request = agent;
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

	describe('compressed responses', () => {
		const content = Buffer.from('Look again at that dot. That\'s here. That\'s home. That\'s us. On it everyone you love, everyone you know, everyone you ever heard of, every human being who ever was, lived out their lives.');
		let server: MockedServer;

		beforeAll(async () => {
			const bucket = new MockedBucket([
				{ name: 'test.txt', content },
			]);
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
			// eslint-disable-next-line @typescript-eslint/naming-convention
			const headers = { 'Accept-Encoding': encoding ?? 'identity' };

			const response = await server.get('/test.txt', headers);

			expect(response.status).toBe(200);
			expect(response.type).toBe('text/plain');
			expect(response.headers['content-encoding']).toStrictEqual(encoding);

			let buffer = response.body as Buffer;
			const contentLength = String(buffer.length);

			switch (encoding) {
				case undefined: break;
				case 'br': buffer = brotliDecompressSync(buffer); break;
				case 'gzip': buffer = gunzipSync(buffer); break;
				default: throw Error();
			}
			expect(buffer).toStrictEqual(content);

			expect(response.headers['content-length']).toStrictEqual(contentLength);
		}
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
