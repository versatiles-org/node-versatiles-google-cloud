import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { ContainerCache, getVersatiles } from './cache.js';
import { AbstractBucketFile } from '../bucket/abstract.js';
import { BucketFileMetadata } from '../bucket/metadata.js';
import type { Versatiles } from './versatiles.js';

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

describe('getVersatiles', () => {
	// Rejecting with a string would lose the stack and slip past `instanceof
	// Error` checks in callers such as the request handler in server.ts.
	it('rejects with an Error carrying the original cause when the stream fails', async () => {
		const thrown: unknown = await getVersatiles(
			new ErroringStreamFile(),
			'http://example.org/broken.versatiles',
		).catch((error: unknown) => error);

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
