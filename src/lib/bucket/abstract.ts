import type { Readable } from 'stream';
import type { BucketFileMetadata } from './metadata.js';
import type { Responder } from '../responder.js';
import { recompress } from '../recompress.js';
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

		await recompress(responder, this.createReadStream());
	}

	public abstract exists(): Promise<boolean>;

	public abstract getMetadata(): Promise<BucketFileMetadata>;

	public abstract createReadStream(opt?: { start: number; end: number }): Readable;
}

export abstract class AbstractBucket {
	public abstract getFile(relativePath: string): AbstractBucketFile;
	public abstract check(): Promise<void>;
}
