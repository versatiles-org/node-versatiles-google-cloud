import type { IncomingHttpHeaders } from 'http';
import type { EncodingTools, EncodingType } from './encoding.js';
import type { Response } from 'express';
import { ENCODINGS, acceptEncoding, findBestEncoding } from './encoding.js';
import { recompress } from './recompress.js';
import { ResponseHeaders } from './response_headers.js';

/**
 * Interface defining the structure and methods of a Responder.
 */
export interface ResponderOptions {
	fastRecompression: boolean; // Flag for fast recompression mode
	response: Response; // The Express response object
	requestHeaders: IncomingHttpHeaders;
	requestNo: number; // The current request number for logging
	verbose: boolean; // Flag for verbose logging
}

enum ResponderState {
	Initialised = 0,
	HeaderSend = 1,
	Finished = 2,
}

/**
 * Class defining the structure and methods of a Responder.
 */
export class Responder {
	readonly #options: ResponderOptions;

	#responderState: ResponderState;

	readonly #time: number;

	readonly #responseHeaders: ResponseHeaders;

	public constructor(options: ResponderOptions) {
		this.#time = Date.now();
		this.#options = options;
		this.#responderState = ResponderState.Initialised;
		this.#responseHeaders = new ResponseHeaders();
	}

	public get fastRecompression(): boolean {
		return this.#options.fastRecompression;
	}

	public get headers(): ResponseHeaders {
		return this.#responseHeaders;
	}

	public get verbose(): boolean {
		return this.#options.verbose;
	}

	public get requestNo(): number {
		return this.#options.requestNo;
	}

	public async respond(
		content: Buffer | string,
		contentMIME: string,
		contentEncoding: EncodingType,
	): Promise<void> {
		this.headers.set('content-type', contentMIME);
		ENCODINGS[contentEncoding].setEncodingHeader(this.#responseHeaders);

		if (typeof content === 'string') content = Buffer.from(content);
		this.log('respond');

		await recompress(this, content);
	}

	public error(code: number, message: string): void {
		this.log(`error ${code}: ${message}`);
		this.#options.response.writeHead(code, { 'content-type': 'text/plain' }).end(message);
	}

	public write(buffer: Buffer, callback: () => void): void {
		if (this.#responderState < ResponderState.HeaderSend) throw Error('Headers not send yet');

		this.#options.response.write(buffer, (error) => {
			if (error) throw Error();
			callback();
		});
	}

	public end(): Promise<void>;
	public end(callback: () => void): void;
	public end(buffer: Buffer): Promise<void>;
	public end(buffer: Buffer, callback: () => void): void;

	public end(
		bufferOrCallback?: Buffer | (() => void),
		maybeCallback?: () => void,
	): Promise<void> | void {
		if (this.#responderState < ResponderState.HeaderSend) throw Error('Headers not send yet');
		if (this.#responderState >= ResponderState.Finished) throw Error('already ended');

		if (Buffer.isBuffer(bufferOrCallback)) {
			const buffer = bufferOrCallback;
			const callback = maybeCallback;
			if (callback !== undefined) {
				this.#options.response.end(buffer, () => {
					this.#responderState = ResponderState.Finished;
					callback();
				});
			} else {
				return new Promise((resolve) =>
					this.#options.response.end(buffer, () => {
						this.#responderState = ResponderState.Finished;
						resolve();
					}),
				);
			}
		} else {
			const callback = bufferOrCallback;
			if (callback !== undefined) {
				this.#options.response.end(() => {
					this.#responderState = ResponderState.Finished;
					callback();
				});
			} else {
				return new Promise((resolve) =>
					this.#options.response.end(() => {
						this.#responderState = ResponderState.Finished;
						resolve();
					}),
				);
			}
		}
	}

	public sendHeaders(status: number): void {
		if (this.#responderState >= ResponderState.HeaderSend) throw Error('Headers already send');
		const headers = this.#responseHeaders.getHeaders();
		this.#responseHeaders.lock();
		this.#options.response.writeHead(status, headers);
		this.#responderState = ResponderState.HeaderSend;
	}

	public acceptEncoding(encoding: EncodingTools): boolean {
		return acceptEncoding(this.#options.requestHeaders, encoding);
	}

	public findBestEncoding(): EncodingTools {
		return findBestEncoding(this.#options.requestHeaders);
	}

	public log(message: string): void {
		if (!this.#options.verbose) return;
		const time = Date.now() - this.#time;
		console.log(`  #${this.#options.requestNo} (${time}ms) ${message}`);
	}
}
