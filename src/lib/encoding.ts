import type { BrotliOptions, ZlibOptions } from 'zlib';
import type { IncomingHttpHeaders } from 'http';
import type { Transform } from 'stream';
import type { ResponseHeaders } from './response_headers.js';
import zlib from 'zlib';

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
	setEncodingHeader: (headers: ResponseHeaders) => void; // Set appropriate encoding headers
}

/**
 * Record mapping encoding types to their respective tools.
 * Provides implementations for 'br', 'gzip', and 'raw' encodings.
 */
export const ENCODINGS: Record<EncodingType, EncodingTools> = {
	br: ((): EncodingTools => {
		function getOptions(fast: boolean, size?: number): BrotliOptions {
			const params = { [zlib.constants.BROTLI_PARAM_QUALITY]: fast ? 3 : 11 };
			if (size != null) params[zlib.constants.BROTLI_PARAM_SIZE_HINT] = size;
			return { params };
		}

		// Brotli encoding tools
		return {
			name: 'br',
			// Implementations for Brotli-specific methods
			compressStream: (fast: boolean, size?: number) =>
				zlib.createBrotliCompress(getOptions(fast, size)),
			decompressStream: () => zlib.createBrotliDecompress(),
			compressBuffer: async (buffer: Buffer, fast: boolean) =>
				new Promise((resolve, reject) => {
					zlib.brotliCompress(buffer, getOptions(fast, buffer.length), (e, b) => {
						if (e) reject(e);
						else resolve(b);
					});
				}),
			decompressBuffer: async (buffer: Buffer) =>
				new Promise((resolve, reject) => {
					zlib.brotliDecompress(buffer, (e, b) => {
						if (e) reject(e);
						else resolve(b);
					});
				}),
			setEncodingHeader: (headers: ResponseHeaders): void => {
				headers.set('content-encoding', 'br');
				return;
			},
		};
	})(),
	gzip: ((): EncodingTools => {
		function getOptions(fast: boolean): ZlibOptions {
			return { level: fast ? 3 : 9 };
		}

		// Gzip encoding tools
		return {
			name: 'gzip',
			// Implementations for Gzip-specific methods
			compressStream: (fast: boolean) => zlib.createGzip(getOptions(fast)),
			decompressStream: () => zlib.createGunzip(),
			compressBuffer: async (buffer: Buffer, fast: boolean) =>
				new Promise((resolve, reject) => {
					zlib.gzip(buffer, getOptions(fast), (e, b) => {
						if (e) reject(e);
						else resolve(b);
					});
				}),
			decompressBuffer: async (buffer: Buffer) =>
				new Promise((resolve, reject) => {
					zlib.gunzip(buffer, (e, b) => {
						if (e) reject(e);
						else resolve(b);
					});
				}),
			setEncodingHeader: (headers: ResponseHeaders): void => {
				headers.set('content-encoding', 'gzip');
				return;
			},
		};
	})(),
	raw: {
		name: 'raw',
		setEncodingHeader: (headers: ResponseHeaders): void => {
			headers.remove('content-encoding');
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
export function parseContentEncoding(contentEncoding?: string): EncodingTools {
	// Logic to parse content encoding
	if (contentEncoding == null) return ENCODINGS.raw;

	if (typeof contentEncoding !== 'string')
		throw Error(`unknown content-encoding ${JSON.stringify(contentEncoding)}`);

	const contentEncodingString = contentEncoding.trim().toLowerCase();
	switch (contentEncodingString) {
		case '':
			return ENCODINGS.raw;
		case 'br':
			return ENCODINGS.br;
		case 'gzip':
			return ENCODINGS.gzip;
	}

	throw Error(`unknown content-encoding ${JSON.stringify(contentEncoding)}`);
}

/**
 * Parses an `accept-encoding` header value into a map of coding name to quality
 * value (`q`). Coding names are lower-cased; a missing `q` defaults to `1`, and
 * a malformed `q` is ignored (treated as `1`). Wildcards (`*`) are kept as-is so
 * callers can decide how to treat them.
 * @param header - The raw `accept-encoding` header value.
 * @returns A map of coding name to its quality value.
 */
function parseAcceptEncoding(header: string): Map<string, number> {
	const result = new Map<string, number>();

	for (const part of header.split(',')) {
		const [rawName, ...params] = part.trim().split(';');
		const name = rawName.trim().toLowerCase();
		if (name === '') continue;

		let q = 1;
		for (const param of params) {
			const match = /^q=(.*)$/i.exec(param.trim());
			if (match) {
				const parsed = Number.parseFloat(match[1]);
				if (!Number.isNaN(parsed)) q = parsed;
			}
		}

		result.set(name, q);
	}

	return result;
}

/**
 * Returns the quality value the client assigned to an explicit coding, or `0`
 * if the coding is absent. Wildcards are intentionally not expanded: a bare `*`
 * does not enable compression, matching this server's conservative behaviour.
 */
function qualityOf(accepted: Map<string, number>, name: EncodingType): number {
	return accepted.get(name) ?? 0;
}

/**
 * Determines the best encoding supported by the client based on the `accept-encoding` HTTP header.
 * Quality values are respected: a coding with `q=0` is never selected, and the
 * highest-quality supported coding wins (ties prefer Brotli over gzip).
 * @param headers - The incoming HTTP headers.
 * @returns The best available `EncodingTools` based on client's preferences.
 */
export function findBestEncoding(headers: IncomingHttpHeaders): EncodingTools {
	const encodingHeader = headers['accept-encoding'];
	if (typeof encodingHeader !== 'string') return ENCODINGS.raw;

	const accepted = parseAcceptEncoding(encodingHeader);
	const brQ = qualityOf(accepted, 'br');
	const gzipQ = qualityOf(accepted, 'gzip');

	if (brQ > 0 && brQ >= gzipQ) return ENCODINGS.br;
	if (gzipQ > 0) return ENCODINGS.gzip;
	return ENCODINGS.raw;
}

/**
 * Checks if the given encoding is acceptable based on the `accept-encoding` HTTP header.
 * A coding explicitly listed with `q=0` is treated as not acceptable.
 * @param headers - The incoming HTTP headers.
 * @param encoding - The `EncodingTools` to check.
 * @returns `true` if the encoding is acceptable, otherwise `false`.
 */
export function acceptEncoding(headers: IncomingHttpHeaders, encoding: EncodingTools): boolean {
	// The identity ("raw") encoding is always acceptable.
	if (encoding.name === 'raw') return true;

	const encodingHeader = headers['accept-encoding'];
	if (encodingHeader == null) return false;

	const headerString = Array.isArray(encodingHeader)
		? encodingHeader.join(',')
		: String(encodingHeader);

	return qualityOf(parseAcceptEncoding(headerString), encoding.name) > 0;
}
