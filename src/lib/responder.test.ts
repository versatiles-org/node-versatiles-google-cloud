import type { MockedResponder } from './responder.mock.js';
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from 'zlib';
import { getMockedResponder } from './responder.mock.js';
import { vi, it, describe, beforeEach, expect } from 'vitest';
import { defaultHeader } from './response_headers.mock.js';

describe('Responder', () => {
	it('should get request number', () => {
		const responder1 = getMockedResponder({ requestNo: 13 });
		expect(responder1.requestNo).toBe(13);

		const responder2 = getMockedResponder({ requestNo: 42 });
		expect(responder2.requestNo).toBe(42);
	});

	it('should get verbose', () => {
		const responder1 = getMockedResponder({ verbose: false });
		expect(responder1.verbose).toBe(false);

		const responder2 = getMockedResponder({ verbose: true });
		expect(responder2.verbose).toBe(true);
	});

	it('should handle error responses correctly', () => {
		const responder = getMockedResponder();
		const errorCode = 404;
		const errorMessage = 'Not Found';
		responder.error(errorCode, errorMessage);

		expect(responder.response.writeHead).toHaveBeenCalledTimes(1);
		expect(responder.response.writeHead(errorCode, { 'content-type': 'text/plaine' }));

		expect(responder.response.end).toHaveBeenCalledTimes(1);
		expect(responder.response.end).toHaveBeenCalledWith(errorMessage);
	});

	it('should respond correctly with raw text content', async () => {
		const responder = getMockedResponder({ fastRecompression: true });

		await responder.respond('content42', 'text/plain', 'raw');

		expect(responder.response.writeHead).toHaveBeenCalledTimes(1);
		expect(responder.response.writeHead).toHaveBeenCalledWith(200, {
			...defaultHeader,
			'content-length': '9',
			'content-type': 'text/plain',
		});
		expect(responder.response.getBuffer().toString()).toBe('content42');
	});

	it('should respond correctly with raw image content', async () => {
		const responder = getMockedResponder();

		await responder.respond('prettyimagedata', 'image/png', 'raw');

		expect(responder.response.writeHead).toHaveBeenCalledTimes(1);
		expect(responder.response.writeHead).toHaveBeenCalledWith(200, {
			...defaultHeader,
			'content-length': '15',
			'content-type': 'image/png',
		});
		expect(responder.response.getBuffer().toString()).toBe('prettyimagedata');
	});

	it('should respond correctly with gzip compressed text content', async () => {
		const responder = getMockedResponder({
			requestHeaders: { 'accept-encoding': 'gzip, br', 'content-type': 'application/json' },
			fastRecompression: true,
		});

		const content = Buffer.from('gzip compressed text content');
		const contentCompressed = gzipSync(content);
		await responder.respond(contentCompressed, 'text/plain', 'gzip');

		expect(responder.response.writeHead).toHaveBeenCalledTimes(1);
		expect(responder.response.writeHead).toHaveBeenCalledWith(200, {
			...defaultHeader,
			'content-encoding': 'gzip',
			'content-length': String(contentCompressed.length),
			'content-type': 'text/plain',
		});

		expect(responder.response.end).toHaveBeenCalledTimes(1);
		const mockFunction = vi.mocked(responder.response.end);
		const buffer = mockFunction.mock.calls.pop();
		if (buffer == null) throw Error();
		expect(gunzipSync(buffer[0])).toStrictEqual(content);
	});

	it('should respond correctly with brotli compressed text content', async () => {
		const responder = getMockedResponder({
			requestHeaders: { 'accept-encoding': 'gzip, br', 'content-type': 'application/json' },
		});

		const content = Buffer.from('brotli compressed text content');
		const contentCompressed = brotliCompressSync(content);
		await responder.respond(contentCompressed, 'text/plain', 'br');

		expect(responder.response.writeHead).toHaveBeenCalledTimes(1);
		expect(responder.response.writeHead).toHaveBeenCalledWith(200, {
			...defaultHeader,
			'content-encoding': 'br',
			'content-length': String(contentCompressed.length),
			'content-type': 'text/plain',
		});

		expect(responder.response.end).toHaveBeenCalledTimes(1);
		const mockFunction = vi.mocked(responder.response.end);
		const buffer = mockFunction.mock.calls.pop();
		if (buffer == null) throw Error();
		expect(brotliDecompressSync(buffer[0])).toStrictEqual(content);
	});

	describe('ending responder', () => {
		let responder: MockedResponder;
		const buffer = Buffer.from('message');
		beforeEach(() => {
			responder = getMockedResponder();
			responder.sendHeaders(200);
		});
		it('async', async () => {
			await responder.end();
			expect(vi.mocked(responder.response.end).mock.calls).toStrictEqual([[expect.any(Function)]]);
		});
		it('async buffer', async () => {
			await responder.end(buffer);
			expect(vi.mocked(responder.response.end).mock.calls).toStrictEqual([
				[buffer, expect.any(Function)],
			]);
		});
		it('sync', async () => {
			await new Promise<void>((r) => responder.end(() => r()));
			expect(vi.mocked(responder.response.end).mock.calls).toStrictEqual([[expect.any(Function)]]);
		});
		it('sync buffer', async () => {
			await new Promise<void>((r) => responder.end(buffer, () => r()));
			expect(vi.mocked(responder.response.end).mock.calls).toStrictEqual([
				[buffer, expect.any(Function)],
			]);
		});
	});

	describe('Error Handling', () => {
		it('should throw error when trying to write before headers are sent', () => {
			expect(() => {
				getMockedResponder().write(Buffer.from('Test'), () => {});
			}).toThrow('Headers not send yet');
		});

		it('should throw error when trying to end before headers are sent', async () => {
			const responder = getMockedResponder();

			await expect(async () => responder.end()).rejects.toThrow('Headers not send yet');
		});

		it('should throw error when trying to send headers after they are already sent', () => {
			const responder = getMockedResponder();
			responder.sendHeaders(200);
			expect(() => {
				responder.sendHeaders(200);
			}).toThrow('Headers already send');
		});

		it('should throw error when trying to end after response is already ended', async () => {
			const responder = getMockedResponder();
			responder.sendHeaders(200);
			await responder.end();
			await expect(async () => responder.end()).rejects.toThrow('already ended');
		});

		it('should correctly transition through states', async () => {
			const responder = getMockedResponder();

			// Initially, headers should not be sent
			expect(() => {
				responder.write(Buffer.from('Test'), () => {});
			}).toThrow('Headers not send yet');

			// Send headers
			responder.sendHeaders(200);
			// Now, headers are sent, write should not throw
			expect(() => {
				responder.write(Buffer.from('Test'), () => {});
			}).not.toThrow();

			// End the response
			await responder.end();
			// Trying to end again should throw
			await expect(async () => responder.end()).rejects.toThrow('already ended');
		});
	});
});
