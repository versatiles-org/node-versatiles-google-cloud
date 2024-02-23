/* eslint-disable @typescript-eslint/naming-convention */
import type { OutgoingHttpHeaders } from 'http';

export class ResponseHeaders {

	readonly #headers: OutgoingHttpHeaders = {
		'cache-control': 'max-age=86400', // Set default cache control header (1 day)
	};

	public get(key: string): string | undefined {
		const value = this.#headers[key];
		return (value === undefined) ? undefined : String(value);
	}

	public set(key: string, value: number | string): this {
		this.#headers[key] = value;
		return this;
	}

	public remove(key: string): void {
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete this.#headers[key];
	}

	public toString(): string {
		return JSON.stringify(this.#headers);
	}

	public getHeaders(): OutgoingHttpHeaders {
		return this.#headers;
	}
}
