import { vi, it, describe, beforeEach, expect, Mocked } from 'vitest';
import { Readable } from 'stream';
import type { File } from '@google-cloud/storage';
import { StaleRevisionError } from './abstract.js';

/** The File that bucket.file(name, { generation }) hands back for a pinned read. */
const pinnedFile = {
	name: 'test.txt',
	getMetadata: vi.fn(),
	createReadStream: vi.fn(),
} as unknown as Mocked<File>;

const bucketFile = vi.fn().mockReturnValue(pinnedFile);

const mockFile = {
	name: 'test.txt',
	getMetadata: vi.fn(),
	createReadStream: vi.fn(),
	bucket: { file: bucketFile },
} as unknown as Mocked<File>;

// Mocking Google Cloud Storage
vi.mock('@google-cloud/storage', () => {
	const mockBucket = {
		file: vi.fn().mockReturnValue(mockFile),
	};
	return {
		Storage: vi.fn(
			class {
				bucket = vi.fn().mockReturnValue(mockBucket);
			},
		),
	};
});

await import('@google-cloud/storage');
const { BucketGoogle, BucketFileGoogle } = await import('./bucket_google.js');

describe('BucketFileGoogle', () => {
	beforeEach(() => {
		vi.mocked(mockFile.getMetadata).mockImplementation(() =>
			Promise.resolve([
				{
					cacheControl: 'no-cache',
					contentType: 'text/plain',
					etag: 'etag123',
					name: 'test.txt',
					timeCreated: new Date().toISOString(),
					size: '1024',
					generation: '1729000000000001',
				},
			]),
		);
		mockFile.createReadStream.mockReturnValue(new Readable());
		pinnedFile.createReadStream.mockReturnValue(new Readable());
		vi.clearAllMocks();
		mockFile.createReadStream.mockReturnValue(new Readable());
		pinnedFile.createReadStream.mockReturnValue(new Readable());
		bucketFile.mockReturnValue(pinnedFile);
	});

	// Tile-index offsets are cached across requests, so a read must name the
	// revision the index came from. Cloud Storage enforces that server-side when
	// the File carries a generation; without it the read would resolve stale
	// offsets against whatever the object currently is.
	describe('revision pinning', () => {
		it('exposes the object generation as the metadata version', async () => {
			const metadata = await new BucketFileGoogle(mockFile).getMetadata();
			expect(metadata.version).toBe('1729000000000001');
		});

		it('reads the live object when no version is given', () => {
			new BucketFileGoogle(mockFile).createReadStream({ start: 0, end: 9 });

			expect(mockFile.createReadStream).toHaveBeenCalledWith({ start: 0, end: 9 });
			expect(bucketFile).not.toHaveBeenCalled();
		});

		it('pins the read to that generation when a version is given', () => {
			new BucketFileGoogle(mockFile).createReadStream({ start: 4, end: 9, version: '17253' });

			expect(bucketFile).toHaveBeenCalledWith('test.txt', { generation: '17253' });
			// The version is a read precondition, not a byte range.
			expect(pinnedFile.createReadStream).toHaveBeenCalledWith({ start: 4, end: 9 });
			expect(mockFile.createReadStream).not.toHaveBeenCalled();
		});

		// Overwriting an object removes the previous generation unless versioning
		// is enabled, so a pinned read then 404s. That means "stale", not
		// "missing": the caller drops its cached index and retries.
		it('reports a 404 on a pinned read as a stale revision', async () => {
			pinnedFile.createReadStream.mockReturnValue(
				new Readable({
					read(): void {
						this.destroy(Object.assign(new Error('No such object'), { code: 404 }));
					},
				}),
			);

			const stream = new BucketFileGoogle(mockFile).createReadStream({
				start: 0,
				end: 9,
				version: '17253',
			});

			const error = await new Promise<unknown>((resolve) => {
				stream.on('error', resolve);
				stream.resume();
			});

			expect(error).toBeInstanceOf(StaleRevisionError);
		});

		it('leaves other read errors alone', async () => {
			pinnedFile.createReadStream.mockReturnValue(
				new Readable({
					read(): void {
						this.destroy(Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }));
					},
				}),
			);

			const stream = new BucketFileGoogle(mockFile).createReadStream({
				start: 0,
				end: 9,
				version: '17253',
			});

			const error = await new Promise<unknown>((resolve) => {
				stream.on('error', resolve);
				stream.resume();
			});

			expect(error).not.toBeInstanceOf(StaleRevisionError);
			expect((error as Error).message).toBe('connection reset');
		});
	});

	it('getMetadata should return BucketFileMetadata instance with correct properties', async () => {
		const file = new BucketFileGoogle(mockFile);
		const metadata = await file.getMetadata();
		expect(JSON.parse(metadata.toString())).toStrictEqual({
			cacheControl: 'no-cache',
			contentLength: '1024',
			contentType: 'text/plain',
			etag: '"etag123"',
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
