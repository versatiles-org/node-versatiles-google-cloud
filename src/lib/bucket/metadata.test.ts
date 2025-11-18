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
			['etag', 'abc123'],
			['content-type', 'image/jpeg'],
		]);
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
