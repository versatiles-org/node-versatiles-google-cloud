import {
	AbstractBucket,
	AbstractBucketFile,
	PathTraversalError,
	StaleRevisionError,
} from './abstract.js';
import type { ReadStreamOptions } from './abstract.js';
import type { Readable } from 'stream';
import { access, stat } from 'fs/promises';
import { createReadStream, statSync } from 'fs';
import type { Stats } from 'fs';
import { resolve, sep } from 'path';
import { BucketFileMetadata } from './metadata.js';

/**
 * Identifies one revision of a local file. The inode is included so a file
 * replaced by rename is detected even when size and timestamp coincide.
 */
function versionOf(stats: Pick<Stats, 'ino' | 'mtimeMs' | 'size'>): string {
	return `${stats.ino}:${stats.mtimeMs}:${stats.size}`;
}

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
			throw new PathTraversalError();
		}
		return safePath;
	}

	public get name(): string {
		return this.#filename;
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
			version: versionOf(statResult),
		});
	}

	// Create a readable stream for the file
	public createReadStream(opt?: ReadStreamOptions): Readable {
		const safePath = this.#validatePath();

		if (opt?.version !== undefined && versionOf(statSync(safePath)) !== opt.version) {
			// Replaced since its index was read, so the cached offsets describe bytes
			// that are no longer there.
			throw new StaleRevisionError();
		}

		const { start, end } = opt ?? {};
		return createReadStream(safePath, opt === undefined ? undefined : { start, end });
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
