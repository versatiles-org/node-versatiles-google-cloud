import type { Readable } from 'stream';
import type { BucketFileMetadata } from './metadata.js';
import type { Responder } from '../responder.js';
import { recompress, streamUnmodified } from '../recompress.js';
import { parseByteRange } from '../range.js';
import { posix } from 'path';

/**
 * Thrown when a requested path resolves outside the bucket's base directory.
 *
 * A distinct type so the server can answer such requests as a normal "not
 * found" instead of misreporting a rejected client request as a server fault.
 */
export class PathTraversalError extends Error {
	public constructor(message = 'Path traversal attempt detected') {
		super(message);
		this.name = 'PathTraversalError';
	}
}

/**
 * Normalises a client-supplied object path and rejects anything that escapes
 * the root it will be resolved against.
 *
 * Must be applied to the request path *before* any bucket prefix is prepended.
 * Afterwards it is too late: "public/../private/x" normalises to "private/x",
 * which is indistinguishable from a legitimate path and silently defeats the
 * confinement that `--directory` is meant to provide.
 *
 * Object paths are always "/"-separated regardless of host platform, so posix
 * semantics are used rather than the platform-dependent `path` functions.
 */
export function normalizeBucketPath(relativePath: string): string {
	const normalized = posix.normalize(relativePath);

	if (normalized === '..' || normalized.startsWith('../') || normalized.startsWith('/')) {
		throw new PathTraversalError();
	}

	return normalized;
}

export abstract class AbstractBucketFile {
	public abstract get name(): string;

	public async serve(responder: Responder): Promise<void> {
		responder.log('serve file');

		const metadata = await this.getMetadata();
		responder.log(`metadata: ${metadata.toString()}`);

		metadata.setHeaders(responder.headers);
		responder.headers.set('accept-ranges', 'bytes');

		if (await this.#serveRange(responder)) return;

		await recompress(responder, this.createReadStream());
	}

	/**
	 * Answers a `Range` request, if one was made and can be satisfied.
	 *
	 * @returns true when the response has been sent, false to fall through to a
	 * normal full-body response — which is always a valid answer to a Range
	 * request, and is what happens for absent, malformed or multi-range headers.
	 */
	async #serveRange(responder: Responder): Promise<boolean> {
		const rangeHeader = responder.getRequestHeader('range');
		if (rangeHeader === undefined) return false;

		// Ranges are resolved against the stored size, so without a known
		// content-length there is nothing to resolve them against.
		const sizeHeader = responder.headers.get('content-length');
		if (sizeHeader === undefined) return false;

		const size = Number(sizeHeader);
		if (!Number.isInteger(size)) return false;

		const range = parseByteRange(rangeHeader, size);
		if (range === null) return false;

		// The representation served no longer depends on Accept-Encoding, but the
		// resource is still negotiable, so caches must keep varying on it.
		responder.headers.set('vary', 'accept-encoding');

		if (range === 'unsatisfiable') {
			responder.log(`range not satisfiable: ${rangeHeader} of ${size}`);
			responder.headers.remove('content-encoding');
			responder.headers.set('content-length', '0');
			responder.headers.set('content-range', `bytes */${size}`);
			responder.sendHeaders(416);
			await responder.end();
			return true;
		}

		const length = range.end - range.start + 1;
		responder.headers.set('content-range', `bytes ${range.start}-${range.end}/${size}`);
		responder.headers.set('content-length', String(length));

		responder.log(`serve range ${range.start}-${range.end}/${size}`);

		// Deliberately not via recompress(): a range names byte offsets in the
		// stored representation, so the body must pass through unmodified.
		await streamUnmodified(
			responder,
			this.createReadStream({ start: range.start, end: range.end }),
			206,
		);

		return true;
	}

	public abstract exists(): Promise<boolean>;

	public abstract getMetadata(): Promise<BucketFileMetadata>;

	public abstract createReadStream(opt?: { start: number; end: number }): Readable;
}

export abstract class AbstractBucket {
	public abstract getFile(relativePath: string): AbstractBucketFile;
	public abstract check(): Promise<void>;
}
