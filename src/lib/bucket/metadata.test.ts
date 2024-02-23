/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { jest } from '@jest/globals';
import { BucketFileMetadata } from './metadata';
import { ResponseHeaders } from '../response_headers';

describe('BucketFileMetadata', () => {
	test('constructor defaults and hash generation', () => {
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

	test('setHeaders correctly sets headers on responder', () => {
		const headers = new ResponseHeaders();
		jest.spyOn(headers, 'set');

		const metadata = new BucketFileMetadata({
			filename: 'test.jpg',
			etag: 'abc123',
			contentType: 'image/jpeg',
			cacheControl: 'public, max-age=31536000',
			size: '500',
		});

		metadata.setHeaders(headers);

		// eslint-disable-next-line @typescript-eslint/unbound-method
		const mockedSet = jest.mocked(headers.set);
		expect(mockedSet.mock.calls).toStrictEqual([
			['content-length', '500'],
			['cache-control', 'public, max-age=31536000'],
			['etag', 'abc123'],
			['content-type', 'image/jpeg'],
		]);
	});

	test('toString returns correct JSON representation', () => {
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
