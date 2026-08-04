import { it, describe, expect } from 'vitest';
import { Readable } from 'stream';
import { AbstractBucketFile, PathTraversalError, normalizeBucketPath } from './abstract.js';
import { BucketFileMetadata } from './metadata.js';
import { MockedBucketFile } from './bucket.mock.js';
import { getMockedResponder } from '../responder.mock.js';

/**
 * A bucket file whose read stream fails partway through, used to verify that
 * `serve()` awaits the recompression pipeline and propagates stream errors
 * instead of swallowing them in a floating promise.
 */
class ErroringBucketFile extends AbstractBucketFile {
	public get name(): string {
		return 'erroring.txt';
	}

	public async getMetadata(): Promise<BucketFileMetadata> {
		return new BucketFileMetadata({ filename: 'erroring.txt', size: 10 });
	}

	public createReadStream(): Readable {
		return new Readable({
			read(): void {
				this.destroy(new Error('stream boom'));
			},
		});
	}
}

describe('normalizeBucketPath', () => {
	it('normalises paths that stay inside the root', () => {
		const cases: [input: string, expected: string][] = [
			['file.txt', 'file.txt'],
			['dir/file.txt', 'dir/file.txt'],
			['dir/./file.txt', 'dir/file.txt'],
			['dir/sub/../file.txt', 'dir/file.txt'],
			['dir//file.txt', 'dir/file.txt'],
			['a/b/c/../../d.txt', 'a/d.txt'],
		];

		for (const [input, expected] of cases) {
			expect(normalizeBucketPath(input), input).toBe(expected);
		}
	});

	it('rejects paths that escape the root', () => {
		const escapes = [
			'../file.txt',
			'..',
			'../../etc/passwd',
			'dir/../../file.txt',
			'a/b/../../../c.txt',
			'/absolute/path',
		];

		for (const input of escapes) {
			expect(() => normalizeBucketPath(input), input).toThrow(PathTraversalError);
		}
	});

	// "public/../private/x" normalises to "private/x", which is why this must run
	// on the request path before any prefix is prepended, not after.
	it('cannot detect an escape once a prefix has been prepended', () => {
		expect(normalizeBucketPath('public/../private/secret.txt')).toBe('private/secret.txt');
	});
});

describe('AbstractBucketFile.serve', () => {
	it('should reject when the read stream errors (pipeline is awaited)', async () => {
		const responder = getMockedResponder({ fastRecompression: true });
		await expect(new ErroringBucketFile().serve(responder)).rejects.toThrow('stream boom');
	});

	it('should stream file content and resolve on success', async () => {
		const responder = getMockedResponder({ fastRecompression: true });
		const file = new MockedBucketFile({ name: 'hello.txt', content: Buffer.from('hello world') });

		await expect(file.serve(responder)).resolves.toBeUndefined();
		expect(responder.response.getBuffer().toString()).toBe('hello world');
	});
});
