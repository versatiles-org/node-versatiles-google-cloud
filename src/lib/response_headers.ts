import type { OutgoingHttpHeaders } from 'http';
import type { EncodingTools } from './encoding.js';
import { parseContentEncoding } from './encoding.js';

export class ResponseHeaders {
	#locked = false;

	readonly #headers: OutgoingHttpHeaders = {
		// Intentionally versionless: advertising the exact version lets clients
		// match it against known advisories.
		server: 'versatiles-google-cloud',
		'cache-control': 'max-age=86400', // Set default cache control header (1 day)
		// The bucket holds whatever the operator uploaded, and its content-type
		// comes from the object's own metadata. Without this, a browser may ignore
		// that type and sniff the bytes instead, so an object stored as text or
		// as an image can end up executed as script on the serving origin.
		'x-content-type-options': 'nosniff',
	};

	public constructor(headers?: OutgoingHttpHeaders) {
		if (headers) {
			Object.entries(headers).forEach(([key, value]) => (this.#headers[key] = value));
		}
	}

	public get(key: string): string | undefined {
		const value = this.#headers[key];
		return value === undefined ? undefined : String(value);
	}

	public set(key: string, value: string): this {
		if (this.#locked)
			throw Error('Headers are locked. Probably because they have already been sent.');
		this.#headers[key] = value;
		return this;
	}

	public remove(key: string): this {
		if (this.#locked)
			throw Error('Headers are locked. Probably because they have already been sent.');

		delete this.#headers[key];
		return this;
	}

	public toString(): string {
		return JSON.stringify(this.#headers);
	}

	public getHeaders(): OutgoingHttpHeaders {
		return this.#headers;
	}

	public getContentEncoding(): EncodingTools {
		return parseContentEncoding(this.#headers['content-encoding']);
	}

	public lock(): this {
		this.#locked = true;
		return this;
	}

	public getMediaType(): string {
		return String(this.#headers['content-type'] ?? '')
			.replace(/\/.*/, '')
			.toLowerCase();
	}
}
