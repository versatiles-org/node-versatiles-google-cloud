import type { Reader as VersatilesReader } from '@versatiles/container';
import type { AbstractBucketFile } from '../bucket/index.js';
import { Versatiles } from './versatiles.js';

/**
 * Upper bound for the number of parsed containers kept in memory. Container
 * names derive from attacker-controlled request paths, so an unbounded cache
 * would grow with every distinct container requested. Least-recently-used
 * entries are evicted once this limit is exceeded.
 */
const CONTAINER_CACHE_LIMIT = 100;

/**
 * A bounded, least-recently-used cache of parsed VersaTiles containers.
 */
export class ContainerCache {
	readonly #map = new Map<string, Versatiles>();

	readonly #limit: number;

	public constructor(limit: number = CONTAINER_CACHE_LIMIT) {
		this.#limit = limit;
	}

	/** Current number of cached entries. Exposed for monitoring and testing. */
	public get size(): number {
		return this.#map.size;
	}

	/** Returns a cached container and marks it as most-recently-used. */
	public get(name: string): Versatiles | undefined {
		const container = this.#map.get(name);
		if (container !== undefined) {
			this.#map.delete(name);
			this.#map.set(name, container);
		}
		return container;
	}

	/** Stores a container, evicting the least-recently-used entry when full. */
	public set(name: string, container: Versatiles): void {
		this.#map.delete(name);
		this.#map.set(name, container);
		while (this.#map.size > this.#limit) {
			const oldest = this.#map.keys().next().value;
			if (oldest === undefined) break;
			this.#map.delete(oldest);
		}
	}

	/** Discards every cached container. */
	public clear(): void {
		this.#map.clear();
	}

	/**
	 * Returns a parsed container for a file, reusing a cached one while the file
	 * is unchanged.
	 *
	 * Cached instances are shared between requests, so they hold only state
	 * derived from the file itself. Anything server-specific — notably the public
	 * URL used to build style.json — is supplied per request instead, since the
	 * cache key is the filename and cannot distinguish two servers reading the
	 * same file.
	 */
	public async getVersatiles(file: AbstractBucketFile): Promise<Versatiles> {
		const metadata = await file.getMetadata();

		let container = this.get(file.name);

		if (container != null) {
			if (container.etag !== metadata.etag) container = undefined;
		}

		if (container == null) {
			const reader = buildReader(file);
			container = await Versatiles.fromReader(reader, metadata.etag);
			this.set(file.name, container);
		}

		return container;
	}
}

function buildReader(file: AbstractBucketFile): VersatilesReader {
	return async (position: number, length: number): Promise<Buffer> => {
		// Read data from the file stream
		return new Promise<Buffer>((resolve, reject) => {
			const buffers = Array<Buffer>();
			file
				.createReadStream({ start: position, end: position + length - 1 })
				.on('data', (chunk: Buffer) => buffers.push(chunk))
				.on('end', () => {
					resolve(Buffer.concat(buffers));
				})
				.on('error', (err: unknown) => {
					// Reject with an Error, not a string: a string rejection carries no
					// stack, and defeats `instanceof Error` checks in callers such as
					// the request handler in server.ts.
					reject(new Error(`error accessing bucket stream - ${String(err)}`, { cause: err }));
				});
		});
	};
}
