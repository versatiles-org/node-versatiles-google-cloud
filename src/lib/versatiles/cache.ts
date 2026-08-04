import type { Reader as VersatilesReader } from '@versatiles/container';
import type { AbstractBucketFile } from '../bucket/index.js';
import { StaleRevisionError } from '../bucket/index.js';
import { Versatiles } from './versatiles.js';

/**
 * Upper bound for the number of parsed containers kept in memory. Container
 * names derive from attacker-controlled request paths, so an unbounded cache
 * would grow with every distinct container requested. Least-recently-used
 * entries are evicted once this limit is exceeded.
 */
const CONTAINER_CACHE_LIMIT = 100;

/**
 * How long a cached container may be served before its file is checked for
 * replacement. Only affects freshness: reads are pinned, so an out-of-date
 * entry serves the previous revision rather than anything corrupt.
 */
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

/** A parsed container together with the revision its index was read from. */
export interface CachedContainer {
	container: Versatiles;
	/** Undefined when the backend cannot identify a revision. */
	version?: string;
}

export interface ContainerCacheOptions {
	limit?: number;
	/** How often a cached container may be checked for replacement. */
	refreshIntervalMs?: number;
	/** Clock, injectable for tests. */
	now?: () => number;
}

/**
 * A bounded, least-recently-used cache of parsed VersaTiles containers.
 */
export class ContainerCache {
	readonly #map = new Map<string, CachedContainer>();

	readonly #refreshAfter = new Map<string, number>();

	readonly #limit: number;

	readonly #refreshIntervalMs: number;

	readonly #now: () => number;

	public constructor(options: ContainerCacheOptions | number = {}) {
		const opts = typeof options === 'number' ? { limit: options } : options;
		this.#limit = opts.limit ?? CONTAINER_CACHE_LIMIT;
		this.#refreshIntervalMs = opts.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
		this.#now = opts.now ?? Date.now;
	}

	/** Current number of cached entries. Exposed for monitoring and testing. */
	public get size(): number {
		return this.#map.size;
	}

	/** Returns a cached container and marks it as most-recently-used. */
	public get(name: string): CachedContainer | undefined {
		const container = this.#map.get(name);
		if (container !== undefined) {
			this.#map.delete(name);
			this.#map.set(name, container);
		}
		return container;
	}

	/** Stores a container, evicting the least-recently-used entry when full. */
	public set(name: string, entry: CachedContainer): void {
		this.#map.delete(name);
		this.#map.set(name, entry);
		while (this.#map.size > this.#limit) {
			const oldest = this.#map.keys().next().value;
			if (oldest === undefined) break;
			this.#map.delete(oldest);
			this.#refreshAfter.delete(oldest);
		}
	}

	/** Discards every cached container. */
	public clear(): void {
		this.#map.clear();
		this.#refreshAfter.clear();
	}

	/**
	 * Returns a parsed container for a file, reusing a cached one when possible.
	 *
	 * A cache hit does **not** re-check the file first. Correctness comes from the
	 * reads themselves: every read is pinned to the revision the tile index was
	 * built from, so a cached index can never be resolved against different
	 * bytes. Checking metadata here would add a round trip to the critical path of
	 * every tile request to buy nothing but freshness — which is instead handled
	 * by a rate-limited refresh that never blocks a response.
	 *
	 * Cached instances are shared between requests, so they hold only state
	 * derived from the file itself. Anything server-specific — notably the public
	 * URL used to build style.json — is supplied per request instead, since the
	 * cache key is the filename and cannot distinguish two servers reading the
	 * same file.
	 */
	public async getVersatiles(file: AbstractBucketFile): Promise<Versatiles> {
		const cached = this.get(file.name);

		if (cached !== undefined) {
			this.#scheduleRefresh(file);
			return cached.container;
		}

		const metadata = await file.getMetadata();
		const version = metadata.version;
		const container = await Versatiles.fromReader(buildReader(file, version), metadata.etag);

		this.set(file.name, { container, version });
		this.#refreshAfter.set(file.name, this.#now() + this.#refreshIntervalMs);

		return container;
	}

	/** Drops a cached container, so the next request re-reads its index. */
	public invalidate(name: string): void {
		this.#map.delete(name);
		this.#refreshAfter.delete(name);
	}

	/**
	 * Checks in the background whether the file has been replaced, at most once
	 * per refresh interval.
	 *
	 * Deliberately not awaited: a stale entry is safe to serve because its reads
	 * are pinned, so the only cost of finding out late is briefly serving the
	 * previous revision. Failures are ignored for the same reason — a transient
	 * metadata error should not discard a container that still reads correctly.
	 */
	#scheduleRefresh(file: AbstractBucketFile): void {
		const now = this.#now();
		if (now < (this.#refreshAfter.get(file.name) ?? 0)) return;
		this.#refreshAfter.set(file.name, now + this.#refreshIntervalMs);

		void file.getMetadata().then(
			(metadata) => {
				const entry = this.#map.get(file.name);
				if (entry !== undefined && entry.version !== metadata.version) this.invalidate(file.name);
			},
			() => undefined,
		);
	}
}

function buildReader(file: AbstractBucketFile, version?: string): VersatilesReader {
	return async (position: number, length: number): Promise<Buffer> => {
		// Read data from the file stream
		return new Promise<Buffer>((resolve, reject) => {
			const buffers = Array<Buffer>();
			file
				.createReadStream({ start: position, end: position + length - 1, version })
				.on('data', (chunk: Buffer) => buffers.push(chunk))
				.on('end', () => {
					resolve(Buffer.concat(buffers));
				})
				.on('error', (err: unknown) => {
					// A stale revision is not a read failure: the caller drops its cached
					// index and retries, so it must reach them unwrapped.
					if (err instanceof StaleRevisionError) {
						reject(err);
						return;
					}

					// Otherwise reject with an Error, not a string: a string rejection
					// carries no stack, and defeats `instanceof Error` checks in callers
					// such as the request handler in server.ts.
					reject(new Error(`error accessing bucket stream - ${String(err)}`, { cause: err }));
				});
		});
	};
}
