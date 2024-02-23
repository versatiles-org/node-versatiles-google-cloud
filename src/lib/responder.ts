/* eslint-disable @typescript-eslint/naming-convention */
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';
import type { EncodingTools, EncodingType } from './encoding';
import type { Response } from 'express';
import { ENCODINGS, acceptEncoding, findBestEncoding, parseContentEncoding } from './encoding';
import { recompress } from './recompress';

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

	readonly #responseHeaders: OutgoingHttpHeaders = {
		'cache-control': 'max-age=86400', // Set default cache control header (1 day)
	};

	public constructor(options: ResponderOptions) {
		this.#options = options;
		this.#responderState = ResponderState.Initialised;
		this.#time = Date.now();
	}

	public get fastRecompression(): boolean {
		return this.#options.fastRecompression;
	}

	public async respond(content: Buffer | string, contentMIME: string, contentEncoding: EncodingType): Promise<void> {
		this.addHeader('content-type', contentMIME);
		ENCODINGS[contentEncoding].setEncodingHeader(this);
		if (typeof content === 'string') content = Buffer.from(content);
		if (this.#options.verbose) console.log(`  #${this.#options.requestNo} respond`);
		await recompress(this, content);
	}

	public error(code: number, message: string): void {
		if (this.#options.verbose) console.log(`  #${this.#options.requestNo} error ${code}: ${message}`);
		this.#options.response
			.status(code)
			.type('text')
			.send(message);
	}

	public addHeader(key: string, value: number | string): this {
		if (this.#responderState >= ResponderState.HeaderSend) throw Error('Headers already send');
		this.#responseHeaders[key] = value;
		return this;
	}

	public setHeaders(header: Map<string, string>): this {
		if (this.#responderState >= ResponderState.HeaderSend) throw Error('Headers already send');
		for (const [key, value] of header.entries()) {
			this.#responseHeaders[key] = value;
		}
		return this;
	}

	public delHeader(key: string): void {
		if (this.#responderState >= ResponderState.HeaderSend) throw Error('Headers already send');
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete this.#responseHeaders[key];
	}

	public getHeadersAsString(): string {
		return JSON.stringify(this.#responseHeaders);
	}

	public write(buffer: Buffer, callback: () => void): void {
		if (this.#responderState <= ResponderState.HeaderSend) throw Error('Headers not send yet');

		this.#options.response.write(buffer, error => {
			if (error) throw Error();
			callback();
		});
	}

	public end(buffer: Buffer | false, callback: () => void): void {
		if (this.#responderState <= ResponderState.HeaderSend) throw Error('Headers not send yet');

		if (buffer !== false) {
			this.#options.response.end(buffer, () => {
				this.#responderState = ResponderState.Finished;
				callback();
			});
		} else {
			this.#options.response.end(() => {
				this.#responderState = ResponderState.Finished;
				callback();
			});
		}
	}

	public sendHeaders(status: number): void {
		if (this.#responderState >= ResponderState.HeaderSend) throw Error('Headers already send');
		this.#options.response.writeHead(status, this.#responseHeaders);
		this.#responderState = ResponderState.HeaderSend;
	}

	public getContentEncoding(): EncodingTools {
		return parseContentEncoding(this.#responseHeaders);
	}

	public getMediaType(): string {
		return String(this.#responseHeaders['content-type']).replace(/\/.*/, '').toLowerCase();
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
