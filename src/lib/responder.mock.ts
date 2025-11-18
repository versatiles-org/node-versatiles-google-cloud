import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';
import type { Response } from 'express';
import { Writable } from 'stream';
import { Responder } from './responder.js';
import { vi } from 'vitest';

export type MockedResponse = Response & { getBuffer: () => Buffer };
export type MockedResponder = Responder & { response: MockedResponse };

export function getResponseSink(): MockedResponse {
	class ResponseSink extends Writable {
		readonly #buffers = Array<Buffer>();

		public _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void): void {
			this.#buffers.push(chunk);
			callback();
		}

		public getBuffer(): Buffer {
			if (this.#buffers.length === 1) {
				return this.#buffers[0];
			}
			return Buffer.concat(this.#buffers);
		}
	}

	const response = new ResponseSink() as unknown as MockedResponse;

	vi.spyOn(response, 'end');
	response.writeHead = vi.fn(() => response);

	return response;
}

export function getMockedResponder(
	options?: {
		fastRecompression?: boolean;
		requestHeaders?: IncomingHttpHeaders;
		responseHeaders?: OutgoingHttpHeaders;
		requestNo?: number;
		verbose?: boolean;
	},
): MockedResponder {
	options ??= {};

	const response = getResponseSink();

	const responder = new Responder({
		fastRecompression: options.fastRecompression ?? false,
		requestHeaders: options.requestHeaders ?? { 'accept-encoding': 'gzip, br' },
		requestNo: options.requestNo ?? 5,
		response,
		verbose: options.verbose ?? false,
	}) as MockedResponder;

	responder.response = response;

	const responseHeaders = options.responseHeaders ?? { 'content-type': 'text/plain' };
	for (const key in responseHeaders) responder.headers.set(key, responseHeaders[key] as string);

	return responder;
}
