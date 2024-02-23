import { AbstractBucket, AbstractBucketFile } from './index';
import { BucketFileMetadata } from './index';
import type { Readable } from 'stream';
import { access, constants, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { resolve } from 'path';

class BucketFileLocal extends AbstractBucketFile {
	readonly #filename: string;

	public constructor(filename: string) {
		super();
		this.#filename = filename;
	}

	public get name(): string {
		return this.#filename;
	}

	// Check if the file exists
	public async exists(): Promise<boolean> {
		try {
			await access(this.#filename, constants.R_OK);
			return true;
		} catch (e) {
			return false;
		}
	}

	// Get metadata for the file
	public async getMetadata(): Promise<BucketFileMetadata> {
		const statResult = await stat(this.#filename);

		return new BucketFileMetadata({
			cacheControl: undefined,
			contentType: undefined,
			etag: undefined,
			filename: this.#filename,
			mtime: statResult.mtime,
			size: statResult.size,
		});
	}

	// Create a readable stream for the file
	public createReadStream(opt?: { start: number; end: number }): Readable {
		return createReadStream(this.#filename, opt);
	}
}

export class BucketLocal extends AbstractBucket {
	readonly #basePath: string;

	public constructor(basePath: string) {
		super();
		this.#basePath = basePath;
	}

	public getFile(relativePath: string): BucketFileLocal {
		return new BucketFileLocal(resolve(this.#basePath, relativePath));
	}
}
