import type { Readable } from 'stream';
import type { Bucket, File } from '@google-cloud/storage';
import {
	AbstractBucket,
	AbstractBucketFile,
	StaleRevisionError,
	normalizeBucketPath,
} from './abstract.js';
import type { ReadStreamOptions } from './abstract.js';
import { Storage } from '@google-cloud/storage';
import { BucketFileMetadata } from './metadata.js';
import { log } from '../logger.js';

export class BucketFileGoogle extends AbstractBucketFile {
	readonly #file: File;

	public constructor(file: File) {
		super();
		this.#file = file;
	}

	public get name(): string {
		return this.#file.name;
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
			version: metadata.generation == null ? undefined : String(metadata.generation),
		});
	}

	// Create a readable stream for the file
	public createReadStream(opt?: ReadStreamOptions): Readable {
		if (opt?.version === undefined) return this.#file.createReadStream(opt);

		// A File built with a generation sends "generation=<n>" on the download, so
		// Cloud Storage serves that exact revision or nothing. Overwriting an object
		// removes the previous generation unless versioning is enabled, so the read
		// then fails with 404 — which means "stale", not "missing".
		const { start, end } = opt;
		const pinned = this.#file.bucket.file(this.#file.name, { generation: opt.version });

		return pinned.createReadStream({ start, end }).on('error', function (this: Readable, error) {
			if ((error as { code?: number }).code === 404) {
				this.destroy(new StaleRevisionError());
			}
		});
	}
}

export class BucketGoogle extends AbstractBucket {
	readonly #bucket: Bucket;

	public constructor(bucketName: string) {
		super();
		const storage = new Storage();
		this.#bucket = storage.bucket(bucketName);
	}

	public async check(): Promise<void> {
		try {
			await this.#bucket.getMetadata();
		} catch (err) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			if ((err as any)?.response?.data?.error === 'invalid_grant') {
				log('ERROR', `You are not authorized to access bucket "${this.#bucket.name}"`, {
					bucket: this.#bucket.name,
				});
				log(
					'ERROR',
					'Maybe you want to set Application Default Credentials (ADC) by running: "gcloud auth application-default login"',
				);
			}
			throw err;
		}
	}

	public getFile(relativePath: string): BucketFileGoogle {
		// Mirrors the check in BucketLocal so both backends reject the same
		// inputs. GCS treats object names literally, so "../" is not traversal
		// there — but relying on that leaves the guarantee resting on a third
		// party's naming semantics rather than on anything this code enforces.
		return new BucketFileGoogle(this.#bucket.file(normalizeBucketPath(relativePath)));
	}
}
