/* eslint-disable @typescript-eslint/naming-convention */
import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http';
import { ENCODINGS, type EncodingType } from './encoding.js';
import type { Response } from 'express';
import { recompress } from './recompress.js';

/**
 * Interface defining the structure and methods of a Responder.
 */
export interface ResponderInterface {
	del: (key: string) => void; // Function to delete a header from the response
	error: (code: number, message: string) => void; // Function to send an error response
	fastRecompression: boolean; // Flag for fast recompression mode
	requestNo: number; // The current request number for logging
	requestHeaders: IncomingHttpHeaders; // Headers of the incoming request
	respond: (content: Buffer | string, contentMIME: string, contentEncoding: EncodingType) => Promise<void>; // Function to send a response
	response: Response; // The Express response object
	responseHeaders: OutgoingHttpHeaders; // Headers to be sent in the response
	set: (key: string, value: string) => ResponderInterface; // Function to set a header in the response
	verbose: boolean; // Flag for verbose logging
}

/**
 * Factory function to create a Responder instance.
 * @param options - Configuration options for the Responder.
 * @returns A new Responder instance.
 */
export function Responder(options: {
	fastRecompression: boolean;
	requestHeaders: IncomingHttpHeaders;
	response: Response;
	requestNo: number;
	verbose: boolean;
}): ResponderInterface {
	const { fastRecompression, response, requestHeaders, requestNo, verbose } = options;

	// Initialize default response headers
	const responseHeaders: OutgoingHttpHeaders = {
		'cache-control': 'max-age=86400', // Set default cache control header (1 day)
	};

	// Define the responder object with its methods
	const responder: ResponderInterface = {
		error,
		del,
		get fastRecompression(): boolean {
			return fastRecompression;
		},
		get requestHeaders(): IncomingHttpHeaders {
			return requestHeaders;
		},
		get requestNo(): number {
			return requestNo;
		},
		respond,
		get response(): Response {
			return response;
		},
		get responseHeaders(): OutgoingHttpHeaders {
			return responseHeaders;
		},
		set,
		get verbose(): boolean {
			return verbose;
		},
	};

	return responder;

	// Implementation of respond method
	async function respond(body: Buffer | string, contentType: string, encoding: EncodingType): Promise<void> {
		set('content-type', contentType);
		ENCODINGS[encoding].setEncodingHeader(responseHeaders);
		if (typeof body === 'string') body = Buffer.from(body);
		if (verbose) console.log(`  #${requestNo} respond`);
		await recompress(responder, body);
	}

	// Implementation of error method
	function error(code: number, message: string): void {
		if (verbose) console.log(`  #${requestNo} error ${code}: ${message}`);
		response
			.status(code)
			.type('text')
			.send(message);
	}

	// Implementation of set method
	function set(key: string, value: string): ResponderInterface {
		responseHeaders[key] = value;
		return responder;
	}

	// Implementation of del method
	function del(key: string): void {
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete responseHeaders[key];
	}
}
