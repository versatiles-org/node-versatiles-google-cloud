import type { EncodingTools } from './encoding';
import type { Responder } from './responder';
import { ENCODINGS } from './encoding';
import { Writable, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const maxBufferSize = 10 * 1024 * 1024; // Define the maximum buffer size for streaming

/**
 * A writable stream that buffers data up to a maximum size, then switches to stream mode.
 * It is used in the recompression process to handle data efficiently.
 */
export class BufferStream extends Writable {
	// Private members and constructor

	readonly #responder: Responder;

	readonly #logPrefix: string | undefined;

	readonly #buffers: Buffer[] = [];

	#size = 0;

	#bufferMode = true;

	/*
	 * Class constructor will receive the injections as parameters.
	 */
	public constructor(
		responder: Responder,
		logPrefix?: string,
	) {
		super();
		this.#responder = responder;
		this.#logPrefix = logPrefix;
	}

	/**
	 * Handles writing of chunks to the stream.
	 * @param chunk - The data chunk to write.
	 * @param encoding - The encoding of the chunk.
	 * @param callback - Callback to signal completion or error.
	 */
	public _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void): void {
		// Log the new chunk if log prefix is provided
		if (this.#logPrefix != null) {
			console.log(this.#logPrefix, 'new chunk:', chunk.length);
		}

		// Buffer the chunks until the maximum buffer size is reached
		if (this.#bufferMode) {
			this.#buffers.push(chunk);
			this.#size += chunk.length;

			// Switch to stream mode if max buffer size is exceeded
			if (this.#size >= maxBufferSize) {
				if (this.#logPrefix != null) {
					console.log(this.#logPrefix, 'stop bufferMode:', this.#buffers.length);
				}

				this.#bufferMode = false;
				this.#prepareStreamMode();
				this.#responder.sendHeaders(200);

				const buffer = Buffer.concat(this.#buffers);
				this.#buffers.length = 0;

				// Write the buffer to the responder stream
				this.#responder.write(buffer, callback);
			} else {
				callback();
			}
		} else {
			// Write directly to the responder stream in stream mode
			this.#responder.write(chunk, callback);
		}
	}

	/**
	 * Finalizes the stream, ensuring all buffered data is written.
	 * @param callback - Callback to signal completion or error.
	 */
	public _final(callback: (error?: Error | null | undefined) => void): void {
		// Log finishing the stream if log prefix is provided
		if (this.#logPrefix != null) {
			console.log(this.#logPrefix, 'finish stream');
		}

		// Handle the finalization of the buffer mode
		if (this.#bufferMode) {
			const buffer = Buffer.concat(this.#buffers);

			if (this.#logPrefix != null) {
				console.log(this.#logPrefix, 'flush to handleBuffer:', buffer.length);
			}

			this.#prepareBufferMode(buffer.length);
			this.#responder.sendHeaders(200);
			this.#responder.end(buffer, callback);
		} else {
			// End the responder stream in stream mode
			this.#responder.end(false, callback);
		}
	}

	// Prepare the response headers for buffer mode, setting content-length and removing transfer-encoding
	#prepareBufferMode(bufferLength: number): void {
		const { headers } = this.#responder;
		headers.remove('transfer-encoding');
		headers.set('content-length', bufferLength);

		if (this.#logPrefix != null) {
			console.log(this.#logPrefix, 'response header for buffer:', headers.toString());
			console.log(this.#logPrefix, 'response buffer length:', bufferLength);
		}
	}

	// Prepare the response headers for stream mode, setting transfer-encoding to chunked and removing content-length
	#prepareStreamMode(): void {
		const { headers } = this.#responder;
		headers.set('transfer-encoding', 'chunked');
		headers.remove('content-length');

		if (this.#logPrefix != null) {
			console.log(this.#logPrefix, 'response header for stream:', headers.toString());
		}
	}
}

/**
 * Recompresses a given body (Buffer or Readable stream) using the best available encoding.
 * @param responder - The ResponderInterface instance handling the response.
 * @param body - The body to recompress, either as a Buffer or a Readable stream.
 * @param logPrefix - Optional prefix for logging purposes.
 * @returns A promise that resolves when recompression is complete.
 */
export async function recompress(
	responder: Responder,
	body: Buffer | Readable,
	logPrefix?: string,
): Promise<void> {
	// Detect and set the incoming and outgoing encodings
	const encodingIn: EncodingTools = responder.getContentEncoding();
	let encodingOut: EncodingTools = encodingIn;

	// do not recompress images, videos, ...
	switch (responder.getMediaType()) {
		case 'audio':
		case 'image':
		case 'video':
			if (!responder.acceptEncoding(encodingOut)) {
				// decompress it
				encodingOut = ENCODINGS.raw;
			}
			break;
		default:
			if (responder.fastRecompression) {
				if (!responder.acceptEncoding(encodingOut)) {
					// decompress it
					encodingOut = ENCODINGS.raw;
				}
			} else {
				// find best accepted encoding
				encodingOut = responder.findBestEncoding();
			}
	}

	// Set vary header for proper handling of different encodings by clients
	responder.headers.set('vary', 'accept-encoding');

	// Set the appropriate encoding header based on the selected encoding
	encodingOut.setEncodingHeader(responder);

	// Prepare the streams for the pipeline
	const streams: (Readable | Writable)[] = [];
	if (Buffer.isBuffer(body)) {
		streams.push(Readable.from(body));
	} else if (Readable.isReadable(body)) {
		streams.push(body);
	} else {
		throw Error('neither Readable nor Buffer');
	}

	// Handle recompression if the input and output encodings are different
	if (encodingIn !== encodingOut) {
		if (logPrefix != null) {
			console.log(logPrefix, 'recompress:', encodingIn.name, encodingOut.name);
		}

		if (encodingIn.decompressStream) {
			streams.push(encodingIn.decompressStream());
		}

		if (encodingOut.compressStream) {
			streams.push(encodingOut.compressStream(responder.fastRecompression));
		}

		responder.headers.remove('content-length');
	}

	// Add the BufferStream to the pipeline and execute the pipeline
	streams.push(new BufferStream(responder, (logPrefix != null) ? logPrefix + ' bufferStream' : undefined));

	await pipeline(streams);

	return;
}
