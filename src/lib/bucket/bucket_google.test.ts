/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/naming-convention */
import { jest } from '@jest/globals';
import { Readable } from 'stream';
import type { File } from '@google-cloud/storage';


const mockFile = {
	name: 'test.txt',
	exists: jest.fn(),
	getMetadata: jest.fn(),
	createReadStream: jest.fn(),
} as unknown as jest.Mocked<File>;

// Mocking Google Cloud Storage
jest.unstable_mockModule('@google-cloud/storage', () => {
	const mockBucket = {
		file: jest.fn().mockReturnValue(mockFile),
	};
	const mockStorage = {
		bucket: jest.fn().mockReturnValue(mockBucket),
	};
	return { Storage: jest.fn().mockReturnValue(mockStorage) };
});

const { } = await import('@google-cloud/storage');
const { BucketGoogle, BucketFileGoogle } = await import('./bucket_google.js');

describe('BucketFileGoogle', () => {
	beforeEach(() => {
		// @ts-expect-error too lazy
		jest.mocked(mockFile.exists).mockReturnValue(Promise.resolve([true]));
		// @ts-expect-error too lazy
		jest.mocked(mockFile.getMetadata).mockReturnValue(Promise.resolve([{
			cacheControl: 'no-cache',
			contentType: 'text/plain',
			etag: 'etag123',
			name: 'test.txt',
			timeCreated: new Date().toISOString(),
			size: '1024',
		}]));
		mockFile.createReadStream.mockReturnValue(new Readable());
	});

	test('exists should return true when file exists', async () => {
		const file = new BucketFileGoogle(mockFile);
		await expect(file.exists()).resolves.toBe(true);
	});

	test('getMetadata should return BucketFileMetadata instance with correct properties', async () => {
		const file = new BucketFileGoogle(mockFile);
		const metadata = await file.getMetadata();
		expect(JSON.parse(metadata.toString())).toStrictEqual({
			'cacheControl': 'no-cache',
			'contentLength': '1024',
			'contentType': 'text/plain',
			'etag': 'etag123',
		});
	});

	test('createReadStream should return a Readable stream', () => {
		const file = new BucketFileGoogle(mockFile);
		const stream = file.createReadStream();
		expect(stream).toBeInstanceOf(Readable);
	});
});

describe('BucketGoogle', () => {
	const bucketName = 'test-bucket';

	test('getFile should return an instance of BucketFileGoogle', () => {
		const bucket = new BucketGoogle(bucketName);
		const file = bucket.getFile('path/to/file.txt');
		expect(file).toBeInstanceOf(BucketFileGoogle);
		expect(file.name).toBe('test.txt');
	});
});
