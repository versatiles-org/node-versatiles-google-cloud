import { BucketFileMetadata } from './types';
import type { Readable } from 'stream';
import type { Bucket, File } from '@google-cloud/storage';
import { AbstractBucket, AbstractBucketFile } from './types';
import { Storage } from '@google-cloud/storage';

class BucketFileGoogle extends AbstractBucketFile {
	readonly #file: File;

	public constructor(file: File) {
		super();
		this.#file = file;
	}

	public get name(): string {
		return this.#file.name;
	}

	// Check if the file exists
	public async exists(): Promise<boolean> {
		const [exists] = await this.#file.exists();
		return exists;
	}

	// Get metadata for the file
	public async getMetadata(): Promise<BucketFileMetadata> {
		const [metadata] = await this.#file.getMetadata();

		return new BucketFileMetadata({
			cacheControl: metadata.cacheControl,
			contentType: metadata.contentType,
			etag: metadata.etag,
			filename: metadata.name,
			mtime: metadata.timeCreated,
			size: metadata.size,
		});
	}

	// Create a readable stream for the file
	public createReadStream(opt?: { start: number; end: number }): Readable {
		return this.#file.createReadStream(opt);
	}
}

export class BucketGoogle extends AbstractBucket {
	readonly #bucket: Bucket;

	public constructor(bucketName: string) {
		super();
		const storage = new Storage();
		this.#bucket = storage.bucket(bucketName);
	}

	public getFile(relativePath: string): BucketFileGoogle {
		return new BucketFileGoogle(this.#bucket.file(relativePath));
	}
}
