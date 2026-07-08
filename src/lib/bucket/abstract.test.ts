import { it, describe, expect } from 'vitest';
import { Readable } from 'stream';
import { AbstractBucketFile } from './abstract.js';
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

	public async exists(): Promise<boolean> {
		return true;
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
