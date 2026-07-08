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
}

const containerCache = new ContainerCache();

export async function getVersatiles(file: AbstractBucketFile, url: string): Promise<Versatiles> {
	const metadata = await file.getMetadata();

	let container = containerCache.get(file.name);

	if (container != null) {
		if (container.etag !== metadata.etag) container = undefined;
	}

	if (container == null) {
		const reader = buildReader(file);
		container = await Versatiles.fromReader(reader, url, metadata.etag);
		containerCache.set(file.name, container);
	}

	return container;
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
					reject(`error accessing bucket stream - ${String(err)}`);
				});
		});
	};
}
