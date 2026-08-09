import { createHash } from 'crypto';
import { lookup } from 'mrmime';
import type { ResponseHeaders } from '../response_headers.js';

/**
 * Formats a value as a valid entity-tag.
 *
 * RFC 9110 §8.8.3 requires an ETag to be a quoted-string, optionally prefixed
 * with `W/`. Values already in that shape are returned untouched, since Cloud
 * Storage may supply one; anything else — including the hash generated below —
 * is quoted. Embedded quotes are dropped rather than escaped, as an entity-tag
 * cannot contain them.
 */
function toEntityTag(value: string): string {
	if (/^(?:W\/)?".*"$/s.test(value)) return value;
	return `"${value.replace(/"/g, '')}"`;
}

export class BucketFileMetadata {
	readonly #header: {
		cacheControl?: string;
		contentEncoding?: string;
		contentType: string;
		etag: string;
		size?: string;
		version?: string;
	};

	public constructor(
		options: {
			cacheControl?: string;
			/**
			 * The encoding the bytes are stored under, when the backend records one.
			 * Kept out of `contentType`'s fallback chain deliberately: it describes
			 * how the bytes are wrapped, not what they represent.
			 */
			contentEncoding?: string;
			contentType?: string;
			etag?: string;
			filename?: string;
			mtime?: Date | string;
			size?: number | string;
			version?: string;
			/**
			 * A hash of the file's bytes, when the backend can supply one. Preferred
			 * over `etag` for the response validator, because it changes only when
			 * the content does.
			 */
			contentHash?: string;
		} = {},
	) {
		let size: string | undefined;
		if (typeof options.size === 'number') {
			size = String(options.size);
		} else {
			size = options.size;
		}
		// "identity" is the explicit way of saying "not encoded", so it is dropped
		// here rather than announced: sending it would put every plain object
		// through the encoding machinery for no reason.
		const contentEncoding = options.contentEncoding?.trim();

		this.#header = {
			cacheControl: options.cacheControl ?? 'max-age=604800',
			contentEncoding:
				contentEncoding == null || contentEncoding === '' || /^identity$/i.test(contentEncoding)
					? undefined
					: contentEncoding,
			contentType:
				options.contentType ?? lookup(options.filename ?? '') ?? 'application/octet-stream',
			// Content hash first: an object's etag also changes when only its
			// metadata does — editing cacheControl or storage class bumps the
			// generation's metageneration — which would invalidate every cached
			// response downstream for bytes that never moved. A re-upload of
			// identical content is likewise a no-op for a content hash, but a new
			// etag. Falls back to the etag, then to a hash of what is known.
			etag: toEntityTag(
				options.contentHash ??
					options.etag ??
					this.generateHash(options.filename, options.size, options.mtime),
			),
			size,
			version: options.version,
		};
	}

	public get etag(): string {
		return this.#header.etag;
	}

	/**
	 * Opaque token identifying this exact revision of the file, used to pin reads
	 * so cached tile-index offsets are never resolved against different bytes.
	 * Undefined when the backend cannot identify a revision.
	 */
	public get version(): string | undefined {
		return this.#header.version;
	}

	/**
	 * The encoding the stored bytes are wrapped in, or undefined when they are
	 * not encoded. Callers need this to decide whether the body can be negotiated
	 * at all — an encoding this server cannot decode has to be forwarded as-is.
	 */
	public get contentEncoding(): string | undefined {
		return this.#header.contentEncoding;
	}

	public setHeaders(headers: ResponseHeaders): void {
		const header = this.#header;

		if (header.size != null) headers.set('content-length', header.size);
		if (header.cacheControl != null) headers.set('cache-control', header.cacheControl);
		if (header.contentEncoding != null) headers.set('content-encoding', header.contentEncoding);
		headers.set('etag', header.etag);
		headers.set('content-type', header.contentType);
	}

	public toString(): string {
		return JSON.stringify({
			contentLength: this.#header.size,
			cacheControl: this.#header.cacheControl,
			contentEncoding: this.#header.contentEncoding,
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
