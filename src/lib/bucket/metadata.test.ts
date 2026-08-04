import { vi, it, describe, expect } from 'vitest';
import { BucketFileMetadata } from './metadata.js';
import { ResponseHeaders } from '../response_headers.js';

describe('BucketFileMetadata', () => {
	it('constructor defaults and hash generation', () => {
		const metadata = new BucketFileMetadata({
			filename: 'test.jpg',
			size: 1024,
			mtime: '2022-01-01T00:00:00.000Z',
		});

		expect(JSON.parse(metadata.toString())).toMatchObject({
			contentType: 'image/jpeg',
			contentLength: '1024',
			cacheControl: 'max-age=604800',
			etag: expect.any(String),
		});
	});

	it('setHeaders correctly sets headers on responder', () => {
		const headers = new ResponseHeaders();
		vi.spyOn(headers, 'set');

		const metadata = new BucketFileMetadata({
			filename: 'test.jpg',
			etag: 'abc123',
			contentType: 'image/jpeg',
			cacheControl: 'public, max-age=31536000',
			size: '500',
		});

		metadata.setHeaders(headers);

		const mockedSet = vi.mocked(headers.set);
		expect(mockedSet.mock.calls).toStrictEqual([
			['content-length', '500'],
			['cache-control', 'public, max-age=31536000'],
			['etag', '"abc123"'],
			['content-type', 'image/jpeg'],
		]);
	});

	// RFC 9110 §8.8.3 requires an ETag to be a quoted-string. It used to be sent
	// bare, which strict caches and intermediaries may ignore.
	describe('entity-tag formatting', () => {
		const etagOf = (etag: string): string => {
			const headers = new ResponseHeaders();
			new BucketFileMetadata({ filename: 'a.txt', etag }).setHeaders(headers);
			return headers.get('etag') ?? '';
		};

		it('quotes a bare value', () => {
			expect(etagOf('abc123')).toBe('"abc123"');
		});

		// Cloud Storage may already supply a well-formed tag; quoting again would
		// produce '""abc123""'.
		it('leaves an already-quoted value untouched', () => {
			expect(etagOf('"abc123"')).toBe('"abc123"');
		});

		it('preserves a weak tag rather than restating it as strong', () => {
			expect(etagOf('W/"abc123"')).toBe('W/"abc123"');
		});

		it('quotes the generated hash too', () => {
			const headers = new ResponseHeaders();
			new BucketFileMetadata({ filename: 'a.txt', size: 10 }).setHeaders(headers);
			expect(headers.get('etag')).toMatch(/^"[0-9a-f]{64}"$/);
		});
	});

	it('toString returns correct JSON representation', () => {
		const metadata = new BucketFileMetadata({
			filename: 'test.png',
			size: 2048,
			mtime: new Date('2022-01-01'),
		});

		expect(JSON.parse(metadata.toString())).toMatchObject({
			contentType: 'image/png',
			contentLength: '2048',
			cacheControl: 'max-age=604800',
			etag: expect.any(String),
		});
	});
});
