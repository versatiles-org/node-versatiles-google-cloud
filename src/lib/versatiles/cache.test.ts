import { describe, it, expect } from 'vitest';
import { ContainerCache } from './cache.js';
import type { Versatiles } from './versatiles.js';

// The cache only ever reads `.etag`, so a minimal stand-in is sufficient here.
function fake(etag: string): Versatiles {
	return { etag } as unknown as Versatiles;
}

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
