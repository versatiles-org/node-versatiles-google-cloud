 
import type { OutgoingHttpHeaders } from 'http';
import type { EncodingTools } from './encoding.js';
import { parseContentEncoding } from './encoding.js';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };

export class ResponseHeaders {
	#locked = false;

	readonly #headers: OutgoingHttpHeaders = {
		'server': 'versatiles-google-cloud v' + version,
		'cache-control': 'max-age=86400', // Set default cache control header (1 day)
	};

	public constructor(headers?: OutgoingHttpHeaders) {
		if (headers) {
			Object.entries(headers).forEach(([key, value]) => this.#headers[key] = value);
		}
	}

	public get(key: string): string | undefined {
		const value = this.#headers[key];
		return (value === undefined) ? undefined : String(value);
	}

	public set(key: string, value: string): this {
		if (this.#locked) throw Error('Headers are locked. Probably because they have already been sent.');
		this.#headers[key] = value;
		return this;
	}

	public remove(key: string): this {
		if (this.#locked) throw Error('Headers are locked. Probably because they have already been sent.');
		 
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
		return String(this.#headers['content-type'] ?? '').replace(/\/.*/, '').toLowerCase();
	}
}
