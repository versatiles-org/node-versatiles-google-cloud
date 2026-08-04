import { describe, it, expect } from 'vitest';
import { ifNoneMatchMatches } from './conditional.js';

const ETAG = '"abc123"';

describe('ifNoneMatchMatches', () => {
	it('matches the current entity-tag', () => {
		expect(ifNoneMatchMatches(ETAG, ETAG)).toBe(true);
	});

	// Weak comparison, unlike If-Range: the question is only whether the client's
	// copy is good enough to reuse, not whether it is byte-identical.
	it('matches regardless of weakness on either side', () => {
		expect(ifNoneMatchMatches('W/"abc123"', ETAG)).toBe(true);
		expect(ifNoneMatchMatches(ETAG, 'W/"abc123"')).toBe(true);
		expect(ifNoneMatchMatches('W/"abc123"', 'W/"abc123"')).toBe(true);
	});

	it('tolerates unquoted spellings', () => {
		expect(ifNoneMatchMatches('abc123', ETAG)).toBe(true);
		expect(ifNoneMatchMatches(ETAG, 'abc123')).toBe(true);
	});

	it('matches any entry in a list', () => {
		expect(ifNoneMatchMatches('"x", "abc123", "y"', ETAG)).toBe(true);
		expect(ifNoneMatchMatches('  "x" ,  W/"abc123"  ', ETAG)).toBe(true);
	});

	it('matches "*" against any existing representation', () => {
		expect(ifNoneMatchMatches('*', ETAG)).toBe(true);
		expect(ifNoneMatchMatches('*', undefined)).toBe(false);
	});

	it('does not match a different tag', () => {
		expect(ifNoneMatchMatches('"nope"', ETAG)).toBe(false);
		expect(ifNoneMatchMatches('"x", "y"', ETAG)).toBe(false);
		expect(ifNoneMatchMatches('"abc1234"', ETAG)).toBe(false);
	});

	it('does not match without an etag or with an empty value', () => {
		expect(ifNoneMatchMatches(ETAG, undefined)).toBe(false);
		expect(ifNoneMatchMatches('', ETAG)).toBe(false);
		expect(ifNoneMatchMatches('   ', ETAG)).toBe(false);
	});
});
