import type { Readable } from 'stream';
import { PassThrough } from 'stream';
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
			// Read, not ignored: an object stored with an encoding is served here
			// exactly as stored (see createReadStream), so the header has to say so.
			// Leaving it out meant the compressed byte count from "size" was sent as
			// the content-length of a body Cloud Storage had silently decompressed.
			contentEncoding: metadata.contentEncoding,
			contentType: metadata.contentType,
			etag: metadata.etag,
			filename: metadata.name,
			mtime: metadata.timeCreated,
			size: metadata.size,
			version: metadata.generation == null ? undefined : String(metadata.generation),
			// md5Hash is absent for composite objects; crc32c is always present.
			contentHash: metadata.md5Hash ?? metadata.crc32c,
		});
	}

	// Create a readable stream for the file
	public createReadStream(opt?: ReadStreamOptions): Readable {
		// decompress: false on every read. By default the client gunzips an object
		// stored with "contentEncoding: gzip" on the way past, which is the one
		// thing that must not happen here: "size" in the metadata counts the stored
		// bytes, so a decompressed body no longer matches the content-length sent
		// with it, and byte ranges no longer name the offsets they resolve to.
		// Serving the stored representation keeps size, ranges and the encoding
		// header describing the same thing — and recompress() can still transcode
		// it for clients that want something else.
		const { start, end } = opt ?? {};
		const range = opt === undefined ? {} : { start, end };

		if (opt?.version === undefined) {
			return this.#file.createReadStream({ ...range, decompress: false });
		}

		// A File built with a generation sends "generation=<n>" on the download, so
		// Cloud Storage serves that exact revision or nothing. Overwriting an object
		// removes the previous generation unless versioning is enabled, so the read
		// then fails with 404 — which means "stale", not "missing".
		const pinned = this.#file.bucket.file(this.#file.name, { generation: opt.version });
		const source = pinned.createReadStream({ start, end, decompress: false });

		// Piped through rather than translated in place: by the time an "error"
		// listener runs, the stream is already failing with that error, and
		// destroying it again is a no-op — so the 404 would reach the caller
		// unmapped and never trigger the stale-revision retry.
		const output = new PassThrough();

		source.on('error', (error: unknown) => {
			output.destroy(
				(error as { code?: number }).code === 404 ? new StaleRevisionError() : (error as Error),
			);
		});

		source.pipe(output);

		return output;
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
