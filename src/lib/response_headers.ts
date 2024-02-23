/* eslint-disable @typescript-eslint/naming-convention */
import type { OutgoingHttpHeaders } from 'http';
import type { EncodingTools } from './encoding';
import { parseContentEncoding } from './encoding';

export class ResponseHeaders {
	#locked = false;

	readonly #headers: OutgoingHttpHeaders = {
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

	public remove(key: string): void {
		if (this.#locked) throw Error('Headers are locked. Probably because they have already been sent.');
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete this.#headers[key];
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

	public lock(): void {
		this.#locked = true;
	}
}
