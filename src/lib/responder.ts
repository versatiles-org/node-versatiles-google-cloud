/* eslint-disable @typescript-eslint/naming-convention */
import type { IncomingHttpHeaders } from 'http';
import type { EncodingTools, EncodingType } from './encoding';
import type { Response } from 'express';
import { ENCODINGS, acceptEncoding, findBestEncoding, parseContentEncoding } from './encoding';
import { recompress } from './recompress';
import { ResponseHeaders } from './response_headers';

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
		if (this.#responderState >= ResponderState.HeaderSend) throw Error('Headers already send');
		return this.#responseHeaders;
	}

	public async respond(content: Buffer | string, contentMIME: string, contentEncoding: EncodingType): Promise<void> {
		this.#responseHeaders.set('content-type', contentMIME);
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
		this.#options.response.writeHead(status, this.#responseHeaders.getHeaders());
		this.#responderState = ResponderState.HeaderSend;
	}

	public getContentEncoding(): EncodingTools {
		return parseContentEncoding(this.#responseHeaders.get('content-encoding'));
	}

	public getMediaType(): string {
		const contentType: string = this.#responseHeaders.get('content-type') ?? '';
		return contentType.replace(/\/.*/, '').toLowerCase();
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
