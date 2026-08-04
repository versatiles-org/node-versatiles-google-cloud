import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { ContainerCache, getVersatiles } from './cache.js';
import { AbstractBucketFile } from '../bucket/abstract.js';
import { BucketFileMetadata } from '../bucket/metadata.js';
import { MockedBucketFile } from '../bucket/bucket.mock.js';
import { getMockedResponder } from '../responder.mock.js';
import type { Versatiles } from './versatiles.js';

const CONTAINER = fileURLToPath(new URL('../../../testdata/island.versatiles', import.meta.url));

// The cache only ever reads `.etag`, so a minimal stand-in is sufficient here.
function fake(etag: string): Versatiles {
	return { etag } as unknown as Versatiles;
}

/**
 * A file whose metadata resolves but whose read stream fails, so the failure
 * happens inside the reader that `getVersatiles` builds.
 */
class ErroringStreamFile extends AbstractBucketFile {
	public get name(): string {
		return 'broken.versatiles';
	}

	public async exists(): Promise<boolean> {
		return true;
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

		const first = await getVersatiles(file);
		const second = await getVersatiles(file);

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

describe('getVersatiles', () => {
	// Rejecting with a string would lose the stack and slip past `instanceof
	// Error` checks in callers such as the request handler in server.ts.
	it('rejects with an Error carrying the original cause when the stream fails', async () => {
		const thrown: unknown = await getVersatiles(new ErroringStreamFile()).catch(
			(error: unknown) => error,
		);

		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toContain('error accessing bucket stream');
		expect((thrown as Error).cause).toBeInstanceOf(Error);
		expect(((thrown as Error).cause as Error).message).toBe('bucket unavailable');
	});
});

describe('ContainerCache', () => {
	it('stores and retrieves entries', () => {
		const cache = new ContainerCache(3);
		const a = fake('a');
		cache.set('a', a);
		expect(cache.get('a')).toBe(a);
		expect(cache.size).toBe(1);
	});

	it('evicts the least-recently-used entry beyond the limit', () => {
		const cache = new ContainerCache(3);
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
		const cache = new ContainerCache(10);
		for (let i = 0; i < 1000; i++) cache.set('k' + i, fake(String(i)));
		expect(cache.size).toBe(10);
	});
});
