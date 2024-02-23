import { createHash } from 'crypto';
import { lookup } from 'mrmime';
import type { Readable } from 'stream';
import type { Responder } from '../responder';

export class BucketFileMetadata {
	readonly #header: {
		cacheControl?: string;
		contentType: string;
		etag: string;
		size?: string;
	};

	public constructor(options: {
		cacheControl?: string;
		contentType?: string;
		etag?: string;
		filename?: string;
		mtime?: Date | string;
		size?: number | string;
	}) {
		let size: string | undefined;
		if (typeof options.size === 'number') {
			size = String(options.size);
		} else {
			// eslint-disable-next-line @typescript-eslint/prefer-destructuring
			size = options.size;
		}
		this.#header = {
			cacheControl: options.cacheControl ?? 'max-age=604800',
			contentType: options.contentType ?? lookup(options.filename ?? '') ?? 'application/octet-stream',
			etag: options.etag ?? this.generateHash(options.filename, options.size, options.mtime),
			size,
		};
	}

	public setHeaders(responder: Responder): void {
		const header = this.#header;

		if (header.size != null) responder.addHeader('content-length', header.size);
		if (header.cacheControl != null) responder.addHeader('cache-control', header.cacheControl);
		responder.addHeader('etag', header.etag);
		responder.addHeader('content-type', header.contentType);
	}

	public toString(): string {
		return JSON.stringify({
			contentLength: this.#header.size,
			cacheControl: this.#header.cacheControl,
			etag: this.#header.etag,
			contentType: this.#header.contentType,
		});
	}

	private generateHash(...args: (Date | number | string | undefined)[]): string {
		const hash = createHash('sha256');
		hash.update(args.join(';'));
		return hash.digest('hex');
	}
}

export abstract class AbstractBucketFile {
	public abstract get name(): string;
	public abstract exists(): Promise<boolean>;
	public abstract getMetadata(): Promise<BucketFileMetadata>;
	public abstract createReadStream(opt?: { start: number; end: number }): Readable;
}

export abstract class AbstractBucket {
	public abstract getFile(relativePath: string): AbstractBucketFile;
}

export { BucketGoogle } from './bucket_google';
export { BucketLocal } from './bucket_local';
