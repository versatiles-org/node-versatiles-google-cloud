import { describe, it, expect } from 'vitest';
import { parseByteRange } from './range.js';
import type { ByteRange } from './range.js';

const SIZE = 100;

describe('parseByteRange', () => {
	it('resolves an explicit range', () => {
		const cases: [header: string, expected: ByteRange][] = [
			['bytes=0-9', { start: 0, end: 9 }],
			['bytes=10-19', { start: 10, end: 19 }],
			['bytes=0-0', { start: 0, end: 0 }],
			['bytes=99-99', { start: 99, end: 99 }],
			['bytes=0-99', { start: 0, end: 99 }],
			// A last-byte-pos beyond the representation is clamped, not rejected.
			['bytes=90-1000', { start: 90, end: 99 }],
		];

		for (const [header, expected] of cases) {
			expect(parseByteRange(header, SIZE), header).toStrictEqual(expected);
		}
	});

	it('resolves an open-ended range', () => {
		expect(parseByteRange('bytes=50-', SIZE)).toStrictEqual({ start: 50, end: 99 });
		expect(parseByteRange('bytes=0-', SIZE)).toStrictEqual({ start: 0, end: 99 });
	});

	it('resolves a suffix range as the final bytes', () => {
		expect(parseByteRange('bytes=-10', SIZE)).toStrictEqual({ start: 90, end: 99 });
		expect(parseByteRange('bytes=-1', SIZE)).toStrictEqual({ start: 99, end: 99 });
		// A suffix longer than the representation yields the whole of it.
		expect(parseByteRange('bytes=-1000', SIZE)).toStrictEqual({ start: 0, end: 99 });
	});

	it('tolerates surrounding whitespace and unit casing', () => {
		expect(parseByteRange('  bytes=0-9  ', SIZE)).toStrictEqual({ start: 0, end: 9 });
		expect(parseByteRange('bytes= 0 - 9 ', SIZE)).toStrictEqual({ start: 0, end: 9 });
		expect(parseByteRange('BYTES=0-9', SIZE)).toStrictEqual({ start: 0, end: 9 });
	});

	// Answered with 416 and a "Content-Range: bytes */<size>" header.
	it('reports ranges that name no bytes as unsatisfiable', () => {
		for (const header of ['bytes=100-', 'bytes=100-200', 'bytes=1000-2000', 'bytes=-0']) {
			expect(parseByteRange(header, SIZE), header).toBe('unsatisfiable');
		}
	});

	it('treats every range over an empty representation as unsatisfiable', () => {
		for (const header of ['bytes=0-', 'bytes=0-0', 'bytes=-1']) {
			expect(parseByteRange(header, 0), header).toBe('unsatisfiable');
		}
	});

	// null means "ignore the header and send the full body", which is always a
	// permitted answer to a Range request.
	it('returns null for headers it will not act on', () => {
		const ignored = [
			undefined,
			'',
			'bytes=',
			'bytes=-',
			'bytes=abc-def',
			// Reversed bounds are malformed rather than unsatisfiable.
			'bytes=9-0',
			// Several ranges would need a multipart/byteranges response.
			'bytes=0-9,20-29',
			'bytes=0-9, 20-29, 40-49',
			// Units other than bytes are not understood.
			'items=0-9',
			'seconds=0-9',
		];

		for (const header of ignored) {
			expect(parseByteRange(header, SIZE), String(header)).toBeNull();
		}
	});

	it('returns null when the size is not a usable integer', () => {
		expect(parseByteRange('bytes=0-9', Number.NaN)).toBeNull();
		expect(parseByteRange('bytes=0-9', 1.5)).toBeNull();
		expect(parseByteRange('bytes=0-9', -1)).toBeNull();
	});

	it('never resolves to a range outside the representation', () => {
		for (const header of ['bytes=0-9', 'bytes=50-', 'bytes=-10', 'bytes=0-1000', 'bytes=99-99']) {
			const range = parseByteRange(header, SIZE);
			if (range === null || range === 'unsatisfiable') continue;

			expect(range.start, header).toBeGreaterThanOrEqual(0);
			expect(range.end, header).toBeLessThan(SIZE);
			expect(range.start, header).toBeLessThanOrEqual(range.end);
		}
	});
});
