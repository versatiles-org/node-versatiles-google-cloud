import { vi, it, describe, beforeEach, expect, Mocked } from 'vitest';
import { Readable } from 'stream';
import type { File } from '@google-cloud/storage';

const mockFile = {
	name: 'test.txt',
	exists: vi.fn(),
	getMetadata: vi.fn(),
	createReadStream: vi.fn(),
} as unknown as Mocked<File>;

// Mocking Google Cloud Storage
vi.mock('@google-cloud/storage', () => {
	const mockBucket = {
		file: vi.fn().mockReturnValue(mockFile),
	};
	return {
		Storage: vi.fn(class {
			bucket = vi.fn().mockReturnValue(mockBucket);
		})
	};
});

await import('@google-cloud/storage');
const { BucketGoogle, BucketFileGoogle } = await import('./bucket_google.js');

describe('BucketFileGoogle', () => {
	beforeEach(() => {
		vi.mocked(mockFile.exists).mockImplementation(() => Promise.resolve([true]));
		vi.mocked(mockFile.getMetadata).mockImplementation(() => Promise.resolve([{
			cacheControl: 'no-cache',
			contentType: 'text/plain',
			etag: 'etag123',
			name: 'test.txt',
			timeCreated: new Date().toISOString(),
			size: '1024',
		}]));
		mockFile.createReadStream.mockReturnValue(new Readable());
	});

	it('exists should return true when file exists', async () => {
		const file = new BucketFileGoogle(mockFile);
		await expect(file.exists()).resolves.toBe(true);
	});

	it('getMetadata should return BucketFileMetadata instance with correct properties', async () => {
		const file = new BucketFileGoogle(mockFile);
		const metadata = await file.getMetadata();
		expect(JSON.parse(metadata.toString())).toStrictEqual({
			'cacheControl': 'no-cache',
			'contentLength': '1024',
			'contentType': 'text/plain',
			'etag': 'etag123',
		});
	});

	it('createReadStream should return a Readable stream', () => {
		const file = new BucketFileGoogle(mockFile);
		const stream = file.createReadStream();
		expect(stream).toBeInstanceOf(Readable);
	});
});

describe('BucketGoogle', () => {
	const bucketName = 'test-bucket';

	it('getFile should return an instance of BucketFileGoogle', () => {
		const bucket = new BucketGoogle(bucketName);
		const file = bucket.getFile('path/to/file.txt');
		expect(file).toBeInstanceOf(BucketFileGoogle);
		expect(file.name).toBe('test.txt');
	});
});
