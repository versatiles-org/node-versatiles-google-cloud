import type { Readable } from 'stream';
import type { BucketFileMetadata } from './metadata.js';
import type { Responder } from '../responder.js';
import { recompress } from '../recompress.js';

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
