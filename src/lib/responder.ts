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

	/**
	 * Sends a status with no body and no content headers, for responses that are
	 * defined to carry no content (e.g. 204 No Content).
	 *
	 * Distinct from `error()`: that one declares `content-type: text/plain` and
	 * writes a message, both of which a 204 must not carry. Node discards the
	 * body silently, so routing a 204 through `error()` produced a response whose
	 * message never reached the client while the code appeared to send one.
	 */
	public sendEmpty(status: number): void {
		this.log(`respond ${status} without body`);

		if (this.#responderState >= ResponderState.HeaderSend) {
			this.log(`cannot send ${status}: headers already sent, destroying response`);
			this.#options.response.destroy();
			this.#responderState = ResponderState.Finished;
			return;
		}

		this.#options.response.writeHead(status).end();
		this.#responderState = ResponderState.Finished;
	}

	public error(code: number, message: string): void {
		this.log(`error ${code}: ${message}`);

		// If the response has already started streaming we can no longer send an
		// error status/body. Abort the connection instead of throwing
		// ERR_HTTP_HEADERS_SENT (which would become an unhandled rejection).
		if (this.#responderState >= ResponderState.HeaderSend) {
			this.log(`cannot send error ${code}: headers already sent, destroying response`);
			this.#options.response.destroy();
			this.#responderState = ResponderState.Finished;
			return;
		}

		this.#options.response.writeHead(code, { 'content-type': 'text/plain' }).end(message);
		this.#responderState = ResponderState.Finished;
	}

	/**
	 * Writes a chunk to the response.
	 *
	 * A write error is handed to `callback`, never thrown: this runs inside a
	 * stream callback, so a throw here escapes the request's try/catch and
	 * surfaces as an uncaught exception. Both callers are `Writable._write`
	 * implementations, so passing the error on lets the stream fail normally
	 * and the pipeline in `recompress()` reject.
	 */
	public write(buffer: Buffer, callback: (error?: Error | null) => void): void {
		if (this.#responderState < ResponderState.HeaderSend) throw Error('Headers not send yet');

		this.#options.response.write(buffer, callback);
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
