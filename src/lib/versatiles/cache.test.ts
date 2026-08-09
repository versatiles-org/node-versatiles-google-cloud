import { describe, it, expect, vi } from 'vitest';
import { Readable } from 'stream';
import { createReadStream } from 'fs';
import { fileURLToPath } from 'url';
import { ContainerCache } from './cache.js';
import type { CachedContainer } from './cache.js';
import { AbstractBucketFile, StaleRevisionError } from '../bucket/abstract.js';
import { BucketFileMetadata } from '../bucket/metadata.js';
import { MockedBucketFile } from '../bucket/bucket.mock.js';
import { getMockedResponder } from '../responder.mock.js';
import type { Versatiles } from './versatiles.js';

const CONTAINER = fileURLToPath(new URL('../../../testdata/island.versatiles', import.meta.url));

// The cache only ever reads `.etag`, so a minimal stand-in is sufficient here.
function fake(etag: string): CachedContainer {
	return { container: { etag } as unknown as Versatiles, version: etag };
}

/**
 * A file whose metadata resolves but whose read stream fails, so the failure
 * happens inside the reader that `getVersatiles` builds.
 */
class ErroringStreamFile extends AbstractBucketFile {
	public get name(): string {
		return 'broken.versatiles';
	}

	public async getMetadata(): Promise<BucketFileMetadata> {
		return new BucketFileMetadata({ filename: 'broken.versatiles', size: 100 });
	}

	public createReadStream(): Readable {
		return new Readable({
			read(): void {
				this.destroy(new Error('bucket unavailable'));
			},
		});
	}
}

describe('cached containers hold no server-specific state', () => {
	// Instances are cached by filename and shared between servers, so a server's
	// own public URL must not be baked into one. It used to be: the first server
	// to populate the cache fixed the URL, and a second server reading the same
	// file served style.json pointing at the first server's domain.
	it('uses the url given per request, not the one the cache was populated with', async () => {
		const file = new MockedBucketFile({ name: 'shared.versatiles', filename: CONTAINER });

		const cache = new ContainerCache();
		const first = await cache.getVersatiles(file);
		const second = await cache.getVersatiles(file);

		// Same cached instance, so a baked-in url would be shared.
		expect(second).toBe(first);

		expect(await styleTileUrl(first, 'https://alpha.example.com/map.versatiles')).toBe(
			'https://alpha.example.com/map.versatiles?{z}/{x}/{y}',
		);
		expect(await styleTileUrl(second, 'https://beta.example.com/map.versatiles')).toBe(
			'https://beta.example.com/map.versatiles?{z}/{x}/{y}',
		);
	});

	async function styleTileUrl(container: Versatiles, url: string): Promise<string> {
		const responder = getMockedResponder({ fastRecompression: true });
		await container.serve('?style.json', url, responder);

		const style = JSON.parse(responder.response.getBuffer().toString()) as {
			sources: Record<string, { tiles: string[] }>;
		};
		return Object.values(style.sources)[0].tiles[0];
	}
});

/** A container file whose revision can be changed between calls. */
class VersionedFile extends AbstractBucketFile {
	public version = 'v1';
	public metadataCalls = 0;
	public readVersions: (string | undefined)[] = [];
	public failStaleReads = false;

	public get name(): string {
		return 'versioned.versatiles';
	}

	public async getMetadata(): Promise<BucketFileMetadata> {
		this.metadataCalls++;
		return new BucketFileMetadata({
			filename: 'versioned.versatiles',
			size: 1000,
			version: this.version,
		});
	}

	public createReadStream(opt?: { start: number; end: number; version?: string }): Readable {
		this.readVersions.push(opt?.version);
		if (this.failStaleReads && opt?.version !== this.version) throw new StaleRevisionError();
		return createReadStream(CONTAINER, { start: opt?.start, end: opt?.end });
	}
}

describe('revision pinning', () => {
	// Tile-index offsets are cached across requests, so every read must name the
	// revision the index came from — otherwise an overwritten container is read
	// at stale offsets and returns unrelated bytes as a valid tile.
	it('pins every read to the revision the index was built from', async () => {
		const file = new VersionedFile();
		const container = await new ContainerCache().getVersatiles(file);
		await container.serve('?8/58/70', 'http://x/', getMockedResponder({ fastRecompression: true }));

		expect(file.readVersions.length).toBeGreaterThan(1);
		expect(new Set(file.readVersions)).toStrictEqual(new Set(['v1']));
	});

	// The whole point of pinning: correctness stops depending on a check that
	// happens before the reads, so that check can leave the critical path.
	it('does not fetch metadata again on a cache hit', async () => {
		const file = new VersionedFile();
		const cache = new ContainerCache({ now: () => 0 });

		await cache.getVersatiles(file);
		const afterFirst = file.metadataCalls;

		for (let i = 0; i < 5; i++) await cache.getVersatiles(file);

		expect(afterFirst).toBe(1);
		expect(file.metadataCalls).toBe(1);
	});

	it('surfaces a stale read unwrapped so the caller can retry', async () => {
		const file = new VersionedFile();
		file.failStaleReads = true;
		const cache = new ContainerCache();

		await cache.getVersatiles(file);
		file.version = 'v2';
		cache.invalidate(file.name);

		// The index is now read at v2, but a reader pinned to v1 must fail loudly.
		const stale = buildStaleRead(file);
		await expect(stale).rejects.toBeInstanceOf(StaleRevisionError);
	});

	async function buildStaleRead(file: VersionedFile): Promise<void> {
		file.version = 'v3';
		const cache = new ContainerCache();
		const container = await cache.getVersatiles(file);
		file.version = 'v4';
		await container.serve('?14/3741/4507', 'http://x/', getMockedResponder({}));
	}
});

describe('background refresh', () => {
	// Freshness must never block a response: a cached entry is safe to serve
	// because its reads are pinned, so the check runs alongside, not before.
	it('drops the entry once the file has been replaced', async () => {
		let t = 0;
		const file = new VersionedFile();
		const cache = new ContainerCache({ refreshIntervalMs: 1000, now: () => t });

		await cache.getVersatiles(file);
		expect(cache.size).toBe(1);

		file.version = 'v2';
		t = 1001;
		await cache.getVersatiles(file);
		await new Promise((resolve) => setImmediate(resolve));

		expect(cache.size).toBe(0);
	});

	it('checks at most once per refresh interval', async () => {
		let t = 0;
		const file = new VersionedFile();
		const cache = new ContainerCache({ refreshIntervalMs: 1000, now: () => t });

		await cache.getVersatiles(file);
		const afterCold = file.metadataCalls;

		t = 500;
		for (let i = 0; i < 5; i++) await cache.getVersatiles(file);
		expect(file.metadataCalls).toBe(afterCold);

		t = 1001;
		await cache.getVersatiles(file);
		await new Promise((resolve) => setImmediate(resolve));
		expect(file.metadataCalls).toBe(afterCold + 1);
	});

	it('keeps serving when the refresh itself fails', async () => {
		let t = 0;
		const file = new VersionedFile();
		const cache = new ContainerCache({ refreshIntervalMs: 1000, now: () => t });

		await cache.getVersatiles(file);
		vi.spyOn(file, 'getMetadata').mockRejectedValue(new Error('transient'));

		t = 1001;
		await expect(cache.getVersatiles(file)).resolves.toBeDefined();
		await new Promise((resolve) => setImmediate(resolve));

		// A transient metadata error must not discard an entry that still reads.
		expect(cache.size).toBe(1);
	});
});

// Reading a container means a metadata lookup plus its whole tile index. On a
// cold start every request for one container arrives before any of them has
// finished, so without sharing they each do that work to reach the same answer.
describe('concurrent loads are shared', () => {
	it('reads the index once for callers arriving together', async () => {
		const file = new VersionedFile();
		const cache = new ContainerCache();

		const containers = await Promise.all(
			Array.from({ length: 10 }, () => cache.getVersatiles(file)),
		);

		expect(file.metadataCalls).toBe(1);
		// The same instance, so they also share the parsed index behind it.
		for (const container of containers) expect(container).toBe(containers[0]);
	});

	// A rejected load must not be handed to everyone who asks later.
	it('does not keep a failed load', async () => {
		const file = new VersionedFile();
		const cache = new ContainerCache();
		const failure = new Error('bucket unavailable');
		const spy = vi.spyOn(file, 'getMetadata').mockRejectedValueOnce(failure);

		await expect(cache.getVersatiles(file)).rejects.toBe(failure);

		spy.mockRestore();
		await expect(cache.getVersatiles(file)).resolves.toBeDefined();
	});

	// The stale-revision retry invalidates and immediately re-reads. Joining a
	// load started before the replacement would hand back the very index that
	// just proved stale.
	it('starts a fresh load after the entry is invalidated', async () => {
		const file = new VersionedFile();
		const cache = new ContainerCache();

		const first = cache.getVersatiles(file);
		cache.invalidate(file.name);
		const second = cache.getVersatiles(file);

		await Promise.all([first, second]);

		expect(file.metadataCalls).toBe(2);
	});
});

describe('getVersatiles', () => {
	// Rejecting with a string would lose the stack and slip past `instanceof
	// Error` checks in callers such as the request handler in server.ts.
	it('rejects with an Error carrying the original cause when the stream fails', async () => {
		const thrown: unknown = await new ContainerCache()
			.getVersatiles(new ErroringStreamFile())
			.catch((error: unknown) => error);

		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toContain('error accessing bucket stream');
		expect((thrown as Error).cause).toBeInstanceOf(Error);
		expect(((thrown as Error).cause as Error).message).toBe('bucket unavailable');
	});
});

describe('ContainerCache', () => {
	it('stores and retrieves entries', () => {
		const cache = new ContainerCache({ limit: 3 });
		const a = fake('a');
		cache.set('a', a);
		expect(cache.get('a')).toBe(a);
		expect(cache.size).toBe(1);
	});

	it('evicts the least-recently-used entry beyond the limit', () => {
		const cache = new ContainerCache({ limit: 3 });
		cache.set('a', fake('a'));
		cache.set('b', fake('b'));
		cache.set('c', fake('c'));

		// Touch "a" so "b" becomes the least-recently-used entry.
		cache.get('a');

		cache.set('d', fake('d'));
		expect(cache.size).toBe(3);
		expect(cache.get('b')).toBeUndefined();
		expect(cache.get('a')).toBeDefined();
		expect(cache.get('c')).toBeDefined();
		expect(cache.get('d')).toBeDefined();
	});

	it('stays bounded under many distinct entries', () => {
		const cache = new ContainerCache({ limit: 10 });
		for (let i = 0; i < 1000; i++) cache.set('k' + i, fake(String(i)));
		expect(cache.size).toBe(10);
	});
});
