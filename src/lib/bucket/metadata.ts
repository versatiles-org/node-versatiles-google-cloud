import { createHash } from 'crypto';
import { lookup } from 'mrmime';
import type { ResponseHeaders } from '../response_headers';

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
	} = {}) {
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

	public setHeaders(headers: ResponseHeaders): void {
		const header = this.#header;

		if (header.size != null) headers.set('content-length', header.size);
		if (header.cacheControl != null) headers.set('cache-control', header.cacheControl);
		headers.set('etag', header.etag);
		headers.set('content-type', header.contentType);
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
