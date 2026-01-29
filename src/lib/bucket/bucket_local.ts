import { AbstractBucket, AbstractBucketFile } from './abstract.js';
import type { Readable } from 'stream';
import { access, constants, stat } from 'fs/promises';
import { createReadStream } from 'fs';
import { resolve, sep } from 'path';
import { BucketFileMetadata } from './metadata.js';

export class BucketFileLocal extends AbstractBucketFile {
	readonly #filename: string;
	readonly #basePath: string;

	public constructor(basePath: string, relativePath: string) {
		super();
		this.#basePath = resolve(basePath);
		this.#filename = resolve(this.#basePath, relativePath);
	}

	#validatePath(): string {
		const safePath = this.#filename;
		// Prevent path traversal: ensure the resolved path is within the base directory
		if (!safePath.startsWith(this.#basePath + sep) && safePath !== this.#basePath) {
			throw new Error('Path traversal attempt detected');
		}
		return safePath;
	}

	public get name(): string {
		return this.#filename;
	}

	// Check if the file exists
	public async exists(): Promise<boolean> {
		const safePath = this.#validatePath();
		try {
			await access(safePath, constants.R_OK);
			return true;
		} catch (_) {
			return false;
		}
	}

	// Get metadata for the file
	public async getMetadata(): Promise<BucketFileMetadata> {
		const safePath = this.#validatePath();
		const statResult = await stat(safePath);

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
		const safePath = this.#validatePath();
		return createReadStream(safePath, opt);
	}
}

export class BucketLocal extends AbstractBucket {
	readonly #basePath: string;

	public constructor(basePath: string) {
		super();
		this.#basePath = resolve(basePath);
	}

	public async check(): Promise<void> {
		await access(this.#basePath);
	}

	public getFile(relativePath: string): BucketFileLocal {
		return new BucketFileLocal(this.#basePath, relativePath);
	}
}
