import { Readable } from 'stream';
import { AbstractBucket, AbstractBucketFile } from './types';
import { openSync, readFileSync, readSync, statSync } from 'fs';
import { BucketFileMetadata } from './metadata';

export type MocketBucketFileInterface = [string, string];

export class MockedBucketFile extends AbstractBucketFile {
	readonly #file?: MocketBucketFileInterface;

	public constructor(file?: MocketBucketFileInterface) {
		super();
		this.#file = file;
	}

	public get name(): string {
		if (!this.#file) throw new Error('no file');
		return this.#file[0];
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async exists(): Promise<boolean> {
		return Boolean(this.#file);
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	public async getMetadata(): Promise<BucketFileMetadata> {
		if (!this.#file) throw new Error('no file');
		return new BucketFileMetadata({
			filename: this.#file[1],
			size: statSync(this.#file[1]).size,
		});
	}

	public createReadStream(range?: { start: number; end: number }): Readable {
		if (!this.#file) throw new Error('no file');

		let buffer: Buffer;

		if (range) {
			const { start, end } = range;
			const length = end - start + 1;
			buffer = Buffer.allocUnsafe(length);
			const fd = openSync(this.#file[1], 'r');
			readSync(fd, buffer, { position: start, length });
		} else {
			buffer = readFileSync(this.#file[1]);
		}

		return Readable.from(buffer);
	}
}

export class MockedBucket extends AbstractBucket {
	readonly #files: Map<string, MocketBucketFileInterface>;

	public constructor(files: MocketBucketFileInterface[]) {
		super();
		this.#files = new Map(files.map(f => [f[0], f]));
	}

	public getFile(path: string): AbstractBucketFile {
		return new MockedBucketFile(this.#files.get(path));
	}
}


