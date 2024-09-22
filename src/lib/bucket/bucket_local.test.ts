 
import { jest } from '@jest/globals';
import { resolve } from 'path';
import { BucketFileMetadata } from './metadata.js';
import type { BucketFileLocal as BucketFileLocalType, BucketLocal as BucketLocalType } from './bucket_local.js';
import type { Stats } from 'fs';

const { constants } = await import('fs/promises');
jest.unstable_mockModule('fs/promises', () => ({
	access: jest.fn(),
	stat: jest.fn(),
	constants,
}));

jest.unstable_mockModule('fs', () => ({
	createReadStream: jest.fn(),
}));

const { access, stat } = await import('fs/promises');
const { createReadStream } = await import('fs');
const { BucketLocal, BucketFileLocal } = await import('./bucket_local.js');

const projectPath = new URL('../../../', import.meta.url).pathname;

describe('BucketFileLocal', () => {
	const filename = resolve(projectPath, 'package.json');
	let file: BucketFileLocalType;

	beforeEach(() => {
		file = new BucketFileLocal(filename);
	});

	test('exists should return true when file is accessible', async () => {
		jest.mocked(access).mockResolvedValue(undefined);
		await expect(file.exists()).resolves.toBe(true);
	});

	test('exists should return false when file is not accessible', async () => {
		jest.mocked(access).mockRejectedValue(new Error('File not found'));
		await expect(file.exists()).resolves.toBe(false);
	});

	test('getMetadata should return instance of BucketFileMetadata', async () => {
		jest.mocked(stat).mockResolvedValue({ mtime: new Date('1989-11-09T19:01:00+01:00'), size: 1024 } as Stats);

		const metadata = await file.getMetadata();
		expect(metadata).toBeInstanceOf(BucketFileMetadata);
		expect(JSON.parse(metadata.toString())).toStrictEqual({ 
			cacheControl: 'max-age=604800',
			contentLength: '1024',
			contentType: 'application/json',
			 
			etag: expect.any(String),
		});
	});

	test('createReadStream should create a readable stream for the file', () => {
		const options = { start: 0, end: 1023 };
		file.createReadStream(options);
		expect(createReadStream).toHaveBeenCalledWith(filename, options);
	});
});

describe('BucketLocal', () => {
	const bucketPath = resolve(projectPath, 'test_files');
	let bucket: BucketLocalType;

	beforeEach(() => {
		bucket = new BucketLocal(bucketPath);
	});

	test('getFile should resolve file path correctly', () => {
		const relativePath = 'dir/test.txt';
		const file = bucket.getFile(relativePath);
		expect(file).toBeInstanceOf(BucketFileLocal);
		expect(file.name).toBe(resolve(bucketPath, relativePath));
	});
});
