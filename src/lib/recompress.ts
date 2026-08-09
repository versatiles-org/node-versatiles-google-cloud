import type { EncodingTools } from './encoding.js';
import type { Responder } from './responder.js';
import { ENCODINGS } from './encoding.js';
import { Writable, Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';

const maxBufferSize = 10 * 1024 * 1024; // Define the maximum buffer size for streaming

/**
 * A writable stream that buffers data up to a maximum size, then switches to stream mode.
 * It is used in the recompression process to handle data efficiently.
 */
export class BufferStream extends Writable {
	// Private members and constructor

	readonly #responder: Responder;

	readonly #buffers: Buffer[] = [];

	#size = 0;

	#bufferMode = true;

	/*
	 * Class constructor will receive the injections as parameters.
	 */
	public constructor(responder: Responder) {
		super();
		this.#responder = responder;
	}

	/**
	 * Handles writing of chunks to the stream.
	 * @param chunk - The data chunk to write.
	 * @param encoding - The encoding of the chunk.
	 * @param callback - Callback to signal completion or error.
	 */
	public _write(
		chunk: Buffer,
		encoding: BufferEncoding,
		callback: (error?: Error | null | undefined) => void,
	): void {
		// Buffer the chunks until the maximum buffer size is reached
		if (this.#bufferMode) {
			this.#buffers.push(chunk);
			this.#size += chunk.length;

			// Switch to stream mode if max buffer size is exceeded
			if (this.#size >= maxBufferSize) {
				this.#responder.log(`bufferstream - stop bufferMode: ${this.#buffers.length}`);

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
		this.#responder.log('bufferstream - finish stream');

		// Handle the finalization of the buffer mode
		if (this.#bufferMode) {
			const buffer = Buffer.concat(this.#buffers);

			this.#responder.log(`bufferstream - flush to handleBuffer: ${buffer.length}`);

			this.#prepareBufferMode(buffer.length);
			this.#responder.sendHeaders(200);
			this.#responder.end(buffer, callback);
		} else {
			// End the responder stream in stream mode
			this.#responder.end(callback);
		}
	}

	// Prepare the response headers for buffer mode, setting content-length and removing transfer-encoding
	#prepareBufferMode(bufferLength: number): void {
		const { headers } = this.#responder;
		headers.remove('transfer-encoding');
		headers.set('content-length', String(bufferLength));

		this.#responder.log(`bufferstream - response header for buffer: ${headers.toString()}`);
		this.#responder.log(`bufferstream - response buffer length: ${bufferLength}`);
	}

	// Prepare the response headers for stream mode, setting transfer-encoding to chunked and removing content-length
	#prepareStreamMode(): void {
		const { headers } = this.#responder;
		headers.set('transfer-encoding', 'chunked');
		headers.remove('content-length');

		this.#responder.log(`bufferstream - response header for stream: ${headers.toString()}`);
	}
}

/**
 * Forwards a stream straight to the responder without buffering it first.
 *
 * Used when nothing needs recompressing and the body size is already known, so
 * there is nothing for buffering to compute. Headers are sent lazily on the
 * first chunk, so a source that fails before producing any data can still be
 * answered with an error status.
 */
export class DirectStream extends Writable {
	readonly #responder: Responder;

	readonly #status: number;

	#headersSent = false;

	public constructor(responder: Responder, status = 200) {
		super();
		this.#responder = responder;
		this.#status = status;
	}

	public _write(
		chunk: Buffer,
		encoding: BufferEncoding,
		callback: (error?: Error | null | undefined) => void,
	): void {
		this.#sendHeadersOnce();
		this.#responder.write(chunk, callback);
	}

	public _final(callback: (error?: Error | null | undefined) => void): void {
		this.#responder.log('directstream - finish stream');
		this.#sendHeadersOnce();
		this.#responder.end(callback);
	}

	#sendHeadersOnce(): void {
		if (this.#headersSent) return;
		this.#responder.sendHeaders(this.#status);
		this.#headersSent = true;
	}
}

/**
 * Streams a body to the client exactly as stored, skipping content negotiation.
 *
 * Used for byte-range responses: the bytes transferred must correspond to the
 * offsets named in `Content-Range`, so recompressing them — which the normal
 * path would do whenever the client accepts a better encoding — would produce a
 * body that does not match the range it claims to be.
 */
export async function streamUnmodified(
	responder: Responder,
	body: Readable,
	status: number,
): Promise<void> {
	await pipeline([body, new DirectStream(responder, status)]);
}

/**
 * Recompresses a given body (Buffer or Readable stream) using the best available encoding.
 * @param responder - The ResponderInterface instance handling the response.
 * @param body - The body to recompress, either as a Buffer or a Readable stream.
 * @param logPrefix - Optional prefix for logging purposes.
 * @returns A promise that resolves when recompression is complete.
 */
export async function recompress(responder: Responder, body: Buffer | Readable): Promise<void> {
	// Detect and set the incoming and outgoing encodings
	const encodingIn: EncodingTools = responder.headers.getContentEncoding();
	let encodingOut: EncodingTools = encodingIn;

	// do not recompress images, videos, ...
	switch (responder.headers.getMediaType()) {
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
	encodingOut.setEncodingHeader(responder.headers);

	let readStream: Readable;
	if (Buffer.isBuffer(body)) {
		readStream = Readable.from(body);
	} else if (Readable.isReadable(body)) {
		readStream = body;
	} else {
		throw Error('neither Readable nor Buffer');
	}

	// How large the body is, when that is knowable. The compressor uses it to
	// size its window and to decide whether the slowest setting is affordable;
	// without it a stream has to be treated as potentially enormous.
	//
	// A buffer knows its own length. A stream does not, so the content-length set
	// from bucket metadata is the only measure available — and it has to be read
	// here, before the recompression branch below removes it.
	//
	// Either way it measures the body as stored, so for a gzip-to-brotli
	// transcode it counts the compressed input and understates what the
	// compressor is actually fed. That makes it a lower bound on the work rather
	// than an exact figure, which is the safe direction to be wrong in.
	let sizeHint: number | undefined;
	if (Buffer.isBuffer(body)) {
		sizeHint = body.length;
	} else {
		const knownSize = Number(responder.headers.get('content-length'));
		if (Number.isInteger(knownSize)) sizeHint = knownSize;
	}

	// Prepare the streams for the pipeline
	const transformStreams: Transform[] = [];
	// Handle recompression if the input and output encodings are different
	if (encodingIn !== encodingOut) {
		responder.log(`recompress: ${encodingIn.name} to ${encodingOut.name}`);

		if (encodingIn.decompressStream) {
			transformStreams.push(encodingIn.decompressStream());
		}

		if (encodingOut.compressStream) {
			transformStreams.push(encodingOut.compressStream(responder.fastRecompression, sizeHint));
		}

		responder.headers.remove('content-length');
	}

	// When nothing needs recompressing and the size is already known (set from
	// bucket metadata), buffering only recomputes a content-length that is
	// already correct. Above the buffer threshold it is worse than useless:
	// #prepareStreamMode() deletes that known content-length and falls back to
	// chunked encoding. Forwarding directly keeps content-length at any size and
	// removes the per-request buffer, which is what bounds memory under load.
	const canForwardDirectly =
		transformStreams.length === 0 && responder.headers.get('content-length') !== undefined;

	const writeStream = canForwardDirectly
		? new DirectStream(responder)
		: new BufferStream(responder);

	await pipeline([readStream, ...transformStreams, writeStream]);

	return;
}
