import { it, describe, expect, vi } from 'vitest';
import type { MockedResponder } from './responder.mock.js';
import type { OutgoingHttpHeaders } from 'http';
import type { Response } from 'express';
import { getMockedResponder } from './responder.mock.js';
import { Readable } from 'stream';
import { recompress, BufferStream } from './recompress.js';
import { ENCODINGS } from './encoding.js';
import zlib from 'zlib';
import { finished } from 'stream/promises';
import { defaultHeader as defaultHeader0 } from './response_headers.mock.js';

const defaultHeader = { ...defaultHeader0, vary: undefined };
delete defaultHeader.vary;

const maxBufferSize = 10 * 1024 * 1024;
const testBuffer = Buffer.from(
	'Krawehl! Krawehl! Taubtrüber Ginst am Musenhain! Trübtauber Hain am Musenginst! Krawehl!',
);

describe('recompress', () => {
	it('should handle different types of media without recompression', async () => {
		const responder = getMockedResponder({
			requestHeaders: { 'accept-encoding': 'gzip' },
			responseHeaders: { 'content-type': 'audio/mpeg' },
		});
		await recompress(responder, testBuffer);

		checkResponseHeaders(responder, {
			...defaultHeader0,
			'content-length': '90',
			'content-type': 'audio/mpeg',
		});
		expect(responder.response.getBuffer()).toStrictEqual(testBuffer);
	});

	it('should handle fast compression setting', async () => {
		const responder = getMockedResponder({
			requestHeaders: { 'accept-encoding': 'gzip' },
			responseHeaders: { 'content-type': 'text/plain' },
			fastRecompression: true,
		});
		await recompress(responder, testBuffer);

		checkResponseHeaders(responder, {
			...defaultHeader0,
			'content-length': '90',
			'content-type': 'text/plain',
		});
		expect(responder.response.getBuffer()).toStrictEqual(testBuffer);
	});

	it('should find the best encoding based on headers', async () => {
		const responder = getMockedResponder({
			requestHeaders: { 'accept-encoding': 'gzip, deflate, br' },
		});
		await recompress(responder, testBuffer);

		checkResponseHeaders(responder, {
			...defaultHeader0,
			'content-encoding': 'br',
			'content-length': '86',
			'content-type': 'text/plain',
		});
		expect(zlib.brotliDecompressSync(responder.response.getBuffer())).toStrictEqual(testBuffer);
	});

	it('should properly handle stream and buffer modes 1', async () => {
		const responder = getMockedResponder({ requestHeaders: { 'accept-encoding': '' } });
		await recompress(responder, Readable.from(Buffer.allocUnsafe(11e6)));

		checkResponseHeaders(responder, {
			...defaultHeader0,
			'content-type': 'text/plain',
			'transfer-encoding': 'chunked',
		});
		expect(responder.response.end).toHaveBeenCalled();
	});

	it('should properly handle stream and buffer modes 2', async () => {
		const responder = getMockedResponder({ responseHeaders: { 'content-type': 'video/mp4' } });
		await recompress(responder, Readable.from(Buffer.allocUnsafe(11e6)));

		checkResponseHeaders(responder, {
			...defaultHeader0,
			'content-type': 'video/mp4',
			'transfer-encoding': 'chunked',
		});
		expect(responder.response.end).toHaveBeenCalled();
	});

	it('should buffer small streams correctly', async () => {
		const stream = Readable.from(testBuffer);
		const responder = getMockedResponder({
			requestHeaders: { 'accept-encoding': 'gzip' },
			responseHeaders: { 'content-type': 'audio/mpeg' },
		});

		await finished(stream.pipe(new BufferStream(responder)));

		const response = responder.response as Response & { getBuffer: () => Buffer };

		expect(response.writeHead).toHaveBeenCalledTimes(1);
		expect(response.writeHead).toHaveBeenCalledWith(200, {
			...defaultHeader,
			'content-length': '90',
			'content-type': 'audio/mpeg',
		});
		expect(response.end).toHaveBeenCalledTimes(1);
		expect(response.getBuffer()).toStrictEqual(testBuffer);
	});

	it('should switch to stream mode for large data', async () => {
		const data = [
			Buffer.from('x'.repeat(maxBufferSize - 1)),
			Buffer.from('x'.repeat(100)),
			Buffer.from('x'.repeat(100)),
		];
		const stream = Readable.from(data);
		const responder = getMockedResponder({
			requestHeaders: { 'accept-encoding': 'gzip' },
			responseHeaders: { 'content-type': 'audio/mpeg' },
		});

		await finished(stream.pipe(new BufferStream(responder)));

		const response = responder.response as Response & { getBuffer: () => Buffer };

		expect(response.writeHead).toHaveBeenCalledTimes(1);
		expect(response.writeHead).toHaveBeenCalledWith(200, {
			...defaultHeader,
			'content-type': 'audio/mpeg',
			'transfer-encoding': 'chunked',
		});
		expect(response.end).toHaveBeenCalledTimes(1);
		expect(Buffer.concat(data).compare(response.getBuffer())).toBe(0);
	});

	// When nothing needs recompressing and the size is already known from bucket
	// metadata, buffering only recomputes a content-length that is already
	// correct — and above the buffer threshold BufferStream deletes it and falls
	// back to chunked encoding, losing information it started with.
	// compressStream has always accepted a size — for the brotli window hint, and
	// now to decide how much effort a payload is worth — and nothing ever passed
	// one, so every compressor ran blind.
	describe('the payload size reaches the compressor', () => {
		const sizePassedTo = async (
			encoding: 'br' | 'gzip',
			body: Buffer | Readable,
			responseHeaders: OutgoingHttpHeaders,
		): Promise<number | undefined> => {
			const spy = vi.spyOn(ENCODINGS[encoding], 'compressStream');
			try {
				const responder = getMockedResponder({
					requestHeaders: { 'accept-encoding': encoding },
					responseHeaders,
				});
				await recompress(responder, body);

				expect(spy).toHaveBeenCalledTimes(1);
				return spy.mock.calls[0][1];
			} finally {
				spy.mockRestore();
			}
		};

		it('uses the buffer length for a buffer body', async () => {
			// A tile arrives as a buffer with no content-length header set yet, so
			// this is the only measure available — and without it every tile would
			// be treated as an unbounded stream.
			const size = await sizePassedTo('br', testBuffer, { 'content-type': 'text/plain' });
			expect(size).toBe(testBuffer.length);
		});

		it('uses the declared content-length for a stream body', async () => {
			const size = await sizePassedTo('br', Readable.from(testBuffer), {
				'content-type': 'text/plain',
				'content-length': String(testBuffer.length),
			});
			expect(size).toBe(testBuffer.length);
		});

		it('passes nothing on for a stream of unknown length', async () => {
			const size = await sizePassedTo('gzip', Readable.from(testBuffer), {
				'content-type': 'text/plain',
			});
			expect(size).toBeUndefined();
		});
	});

	// Node discards the body of a HEAD response, so producing one is pure waste:
	// the object is read out of the bucket and compressed only to be thrown away.
	describe('HEAD responses are not produced', () => {
		it('never reads the source and never compresses', async () => {
			const compress = vi.spyOn(ENCODINGS.br, 'compressStream');
			try {
				let bytesRead = 0;
				const source = Readable.from(testBuffer);
				source.on('data', (chunk: Buffer) => (bytesRead += chunk.length));

				const responder = getMockedResponder({
					isHeadRequest: true,
					requestHeaders: { 'accept-encoding': 'br' },
					responseHeaders: { 'content-type': 'text/plain' },
				});

				await recompress(responder, source);

				expect(bytesRead).toBe(0);
				expect(compress).not.toHaveBeenCalled();
				expect(responder.response.getBuffer().length).toBe(0);
				expect(source.destroyed).toBe(true);
			} finally {
				compress.mockRestore();
			}
		});

		it('drops content-length it cannot know without compressing', async () => {
			const responder = getMockedResponder({
				isHeadRequest: true,
				requestHeaders: { 'accept-encoding': 'br' },
				responseHeaders: { 'content-type': 'text/plain', 'content-length': '90' },
			});

			await recompress(responder, Readable.from(testBuffer));

			const headers = getWriteHeadHeaders(responder);
			expect(headers['content-encoding']).toBe('br');
			expect(headers['content-length']).toBeUndefined();
		});

		it('reports the exact length when nothing would alter the bytes', async () => {
			const responder = getMockedResponder({
				isHeadRequest: true,
				requestHeaders: { 'accept-encoding': 'identity' },
				responseHeaders: { 'content-type': 'text/plain' },
			});

			await recompress(responder, testBuffer);

			const headers = getWriteHeadHeaders(responder);
			expect(headers['content-length']).toBe(String(testBuffer.length));
		});
	});

	describe('direct forwarding when no recompression is needed', () => {
		it('keeps the known content-length instead of buffering', async () => {
			const responder = getMockedResponder({
				requestHeaders: { 'accept-encoding': 'identity' },
				responseHeaders: { 'content-type': 'audio/mpeg', 'content-length': '90' },
			});

			await recompress(responder, Readable.from(testBuffer));

			const headers = getWriteHeadHeaders(responder);
			expect(headers['content-length']).toBe('90');
			expect(headers['transfer-encoding']).toBeUndefined();
			expect(responder.response.getBuffer()).toStrictEqual(testBuffer);
		});

		it('keeps content-length for bodies larger than the buffer threshold', async () => {
			const chunks = [Buffer.alloc(maxBufferSize, 0x61), Buffer.alloc(1024, 0x62)];
			const total = maxBufferSize + 1024;

			const responder = getMockedResponder({
				requestHeaders: { 'accept-encoding': 'identity' },
				responseHeaders: { 'content-type': 'audio/mpeg', 'content-length': String(total) },
			});

			await recompress(responder, Readable.from(chunks));

			const headers = getWriteHeadHeaders(responder);
			expect(headers['content-length']).toBe(String(total));
			expect(headers['transfer-encoding']).toBeUndefined();
			expect(responder.response.getBuffer().length).toBe(total);
		});

		// The buffering path is still required when the body is recompressed,
		// because the output size is not known until compression finishes.
		it('still buffers when the body is recompressed', async () => {
			const responder = getMockedResponder({
				requestHeaders: { 'accept-encoding': 'gzip' },
				responseHeaders: { 'content-type': 'text/plain', 'content-length': '90' },
			});

			await recompress(responder, Readable.from(testBuffer));

			const headers = getWriteHeadHeaders(responder);
			expect(headers['content-encoding']).toBe('gzip');
			// Recomputed from the compressed output, not the original size.
			expect(headers['content-length']).not.toBe('90');
			expect(zlib.gunzipSync(responder.response.getBuffer())).toStrictEqual(testBuffer);
		});

		it('falls back to buffering when the size is unknown', async () => {
			const responder = getMockedResponder({
				requestHeaders: { 'accept-encoding': 'identity' },
				responseHeaders: { 'content-type': 'audio/mpeg' },
			});

			await recompress(responder, Readable.from(testBuffer));

			// No content-length was supplied, so buffering computed one.
			expect(getWriteHeadHeaders(responder)['content-length']).toBe('90');
		});
	});

	describe('systematically check recompression', () => {
		const encodings = Object.keys(ENCODINGS);
		for (const encodingIn of encodings) {
			let buffer: Buffer;
			switch (encodingIn) {
				case 'raw':
					buffer = testBuffer;
					break;
				case 'gzip':
					buffer = zlib.gzipSync(testBuffer, { level: 9 });
					break;
				case 'br':
					buffer = zlib.brotliCompressSync(testBuffer);
					break;
				default:
					throw Error('unknown encoding: ' + encodingIn);
			}
			for (const encodingOut of encodings) {
				for (const isStream of [true, false]) {
					it(`from ${encodingIn} to ${encodingOut} for ${isStream ? 'stream' : 'buffer'}s`, async () => {
						const responder = getMockedResponder({
							responseHeaders: {
								'content-encoding': encodingIn === 'raw' ? undefined : encodingIn,
							},
							requestHeaders: { 'accept-encoding': encodingOut },
						});
						const body = isStream ? Readable.from(buffer) : buffer;
						await recompress(responder, body);

						const contentEncoding = responder.headers.get('content-encoding');
						switch (encodingOut) {
							case 'raw':
								expect(contentEncoding).toBeUndefined();
								break;
							default:
								expect(contentEncoding).toBe(encodingOut);
								break;
						}

						let bufferOut = responder.response.getBuffer();
						switch (encodingOut) {
							case 'gzip':
								bufferOut = zlib.gunzipSync(bufferOut);
								break;
							case 'br':
								bufferOut = zlib.brotliDecompressSync(bufferOut);
								break;
							default:
						}

						expect(bufferOut).toStrictEqual(testBuffer);
					});
				}
			}
		}
	});

	/** The headers actually written, asserting exactly one writeHead call. */
	function getWriteHeadHeaders(responder: MockedResponder): OutgoingHttpHeaders {
		expect(responder.response.writeHead).toHaveBeenCalledTimes(1);
		expect(responder.response.writeHead).toHaveBeenCalledWith(200, responder.headers.getHeaders());
		return responder.headers.getHeaders();
	}

	function checkResponseHeaders(
		responder: MockedResponder,
		responseHeaders: OutgoingHttpHeaders,
	): void {
		expect(responder.headers.getHeaders()).toStrictEqual(responseHeaders);
		expect(responder.response.writeHead).toHaveBeenCalledTimes(1);
		expect(responder.response.writeHead).toHaveBeenCalledWith(200, responseHeaders);
	}
});
