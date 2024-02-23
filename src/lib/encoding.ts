import type { BrotliOptions, ZlibOptions } from 'node:zlib';
import type { OutgoingHttpHeaders, IncomingHttpHeaders } from 'node:http';
import type { Transform } from 'node:stream';
import zlib from 'node:zlib';
import type { Responder } from './responder';

export type EncodingType = 'br' | 'gzip' | 'raw';

/**
 * Interface representing tools for handling different encoding types.
 * Each property represents a functionality related to a specific encoding type.
 */
export interface EncodingTools {
	name: EncodingType;
	compressStream?: (fast: boolean, size?: number) => Transform; // Create a stream for compressing data
	decompressStream?: () => Transform; // Create a stream for decompressing data
	compressBuffer?: (buffer: Buffer, fast: boolean) => Buffer | Promise<Buffer>; // Compress a buffer
	decompressBuffer?: (buffer: Buffer) => Buffer | Promise<Buffer>; // Decompress a buffer
	setEncodingHeader: (responder: Responder) => void; // Set appropriate encoding headers
}

/**
 * Record mapping encoding types to their respective tools.
 * Provides implementations for 'br', 'gzip', and 'raw' encodings.
 */
export const ENCODINGS: Record<EncodingType, EncodingTools> = {
	'br': ((): EncodingTools => {
		function getOptions(fast: boolean, size?: number): BrotliOptions {
			const params = { [zlib.constants.BROTLI_PARAM_QUALITY]: fast ? 3 : 11 };
			if (size != null) params[zlib.constants.BROTLI_PARAM_SIZE_HINT] = size;
			return { params };
		}

		// Brotli encoding tools
		return {
			name: 'br',
			// Implementations for Brotli-specific methods
			compressStream: (fast: boolean, size?: number) => zlib.createBrotliCompress(getOptions(fast, size)),
			decompressStream: () => zlib.createBrotliDecompress(),
			compressBuffer: async (buffer: Buffer, fast: boolean) => new Promise(resolve => {
				zlib.brotliCompress(buffer, getOptions(fast, buffer.length), (e, b) => {
					resolve(b);
				});
			}),
			decompressBuffer: async (buffer: Buffer) => new Promise(resolve => {
				zlib.brotliDecompress(buffer, (e, b) => {
					resolve(b);
				});
			}),
			setEncodingHeader: (responder: Responder): void => {
				responder.addHeader('content-encoding', 'br');
				return;
			},
		};
	})(),
	'gzip': ((): EncodingTools => {
		function getOptions(fast: boolean): ZlibOptions {
			return { level: fast ? 3 : 9 };
		}

		// Gzip encoding tools
		return {
			name: 'gzip',
			// Implementations for Gzip-specific methods
			compressStream: (fast: boolean) => zlib.createGzip(getOptions(fast)),
			decompressStream: () => zlib.createGunzip(),
			compressBuffer: async (buffer: Buffer, fast: boolean) => new Promise(resolve => {
				zlib.gzip(buffer, getOptions(fast), (e, b) => {
					resolve(b);
				});
			}),
			decompressBuffer: async (buffer: Buffer) => new Promise(resolve => {
				zlib.gunzip(buffer, (e, b) => {
					resolve(b);
				});
			}),
			setEncodingHeader: (responder: Responder): void => {
				responder.addHeader('content-encoding', 'gzip');
				return;
			},
		};
	})(),
	'raw': {
		name: 'raw',
		setEncodingHeader: (responder: Responder): void => {
			responder.delHeader('content-encoding');
			return;
		},
	},
};

/**
 * Parses the content encoding from the given HTTP headers and returns the corresponding encoding tools.
 * @param headers - The outgoing HTTP headers.
 * @returns The corresponding `EncodingTools` based on the content encoding header.
 * @throws Error if the content encoding is unknown.
 */
export function parseContentEncoding(headers: OutgoingHttpHeaders): EncodingTools {
	// Logic to parse content encoding
	const contentEncoding = headers['content-encoding'];
	if (contentEncoding == null) return ENCODINGS.raw;

	if (typeof contentEncoding !== 'string') throw Error(`unknown content-encoding ${JSON.stringify(contentEncoding)}`);

	const contentEncodingString = contentEncoding.trim().toLowerCase();
	switch (contentEncodingString) {
		case '': return ENCODINGS.raw;
		case 'br': return ENCODINGS.br;
		case 'gzip': return ENCODINGS.gzip;
	}

	throw Error(`unknown content-encoding ${JSON.stringify(contentEncoding)}`);
}

/**
 * Determines the best encoding supported by the client based on the `accept-encoding` HTTP header.
 * @param headers - The incoming HTTP headers.
 * @returns The best available `EncodingTools` based on client's preferences.
 */
export function findBestEncoding(headers: IncomingHttpHeaders): EncodingTools {
	// Logic to find the best encoding
	const encodingHeader = headers['accept-encoding'];
	if (typeof encodingHeader !== 'string') return ENCODINGS.raw;

	const encodingString: string = encodingHeader.toLowerCase();

	if (encodingString.includes('br')) return ENCODINGS.br;
	if (encodingString.includes('gzip')) return ENCODINGS.gzip;
	return ENCODINGS.raw;
}

/**
 * Checks if the given encoding is acceptable based on the `accept-encoding` HTTP header.
 * @param headers - The incoming HTTP headers.
 * @param encoding - The `EncodingTools` to check.
 * @returns `true` if the encoding is acceptable, otherwise `false`.
 */
export function acceptEncoding(headers: IncomingHttpHeaders, encoding: EncodingTools): boolean {
	// Logic to check if the encoding is acceptable
	if (encoding.name === 'raw') return true;

	const encodingHeader = headers['accept-encoding'];
	if (encodingHeader == null) return encoding === ENCODINGS.raw;

	return JSON.stringify(encodingHeader).toLowerCase().includes(encoding.name);
}
