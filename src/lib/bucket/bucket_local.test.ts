import { vi, it, describe, beforeEach, expect } from 'vitest';
import { resolve } from 'path';
import { BucketFileMetadata } from './metadata.js';
import type {
	BucketFileLocal as BucketFileLocalType,
	BucketLocal as BucketLocalType,
} from './bucket_local.js';
import type { Stats } from 'fs';

vi.mock(import('fs/promises'), async (original) => {
	const constants = (await original()).constants;
	return {
		access: vi.fn(),
		stat: vi.fn(),
		constants,
	};
});

vi.mock('fs', () => ({
	createReadStream: vi.fn(),
}));

const { access, stat } = await import('fs/promises');
const { createReadStream } = await import('fs');
const { BucketLocal, BucketFileLocal } = await import('./bucket_local.js');

const projectPath = new URL('../../../', import.meta.url).pathname;

describe('BucketFileLocal', () => {
	const basePath = projectPath;
	const relativePath = 'package.json';
	const filename = resolve(basePath, relativePath);
	let file: BucketFileLocalType;

	beforeEach(() => {
		file = new BucketFileLocal(basePath, relativePath);
	});

	it('exists should return true when file is accessible', async () => {
		vi.mocked(access).mockResolvedValue(undefined);
		await expect(file.exists()).resolves.toBe(true);
	});

	it('exists should return false when file is not accessible', async () => {
		vi.mocked(access).mockRejectedValue(new Error('File not found'));
		await expect(file.exists()).resolves.toBe(false);
	});

	it('getMetadata should return instance of BucketFileMetadata', async () => {
		vi.mocked(stat).mockResolvedValue({
			mtime: new Date('1989-11-09T19:01:00+01:00'),
			size: 1024,
		} as Stats);

		const metadata = await file.getMetadata();
		expect(metadata).toBeInstanceOf(BucketFileMetadata);
		expect(JSON.parse(metadata.toString())).toStrictEqual({
			cacheControl: 'max-age=604800',
			contentLength: '1024',
			contentType: 'application/json',

			etag: expect.any(String),
		});
	});

	it('createReadStream should create a readable stream for the file', () => {
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

	it('getFile should resolve file path correctly', () => {
		const relativePath = 'dir/test.txt';
		const file = bucket.getFile(relativePath);
		expect(file).toBeInstanceOf(BucketFileLocal);
		expect(file.name).toBe(resolve(bucketPath, relativePath));
	});

	it('getFile should throw on path traversal attempts when accessing file', async () => {
		const file1 = bucket.getFile('../package.json');
		await expect(file1.exists()).rejects.toThrow('Path traversal attempt detected');

		const file2 = bucket.getFile('../../etc/passwd');
		expect(() => file2.createReadStream()).toThrow('Path traversal attempt detected');

		const file3 = bucket.getFile('/etc/passwd');
		await expect(file3.getMetadata()).rejects.toThrow('Path traversal attempt detected');
	});

	it('getFile should allow valid nested paths', async () => {
		vi.mocked(access).mockResolvedValue(undefined);
		const file = bucket.getFile('subdir/../other/file.txt');
		expect(file.name).toBe(resolve(bucketPath, 'other/file.txt'));
		await expect(file.exists()).resolves.toBe(true);
	});
});
