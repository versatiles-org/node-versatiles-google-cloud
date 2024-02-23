import type { Readable } from 'stream';
import type { BucketFileMetadata } from './metadata';

export abstract class AbstractBucketFile {
	public abstract get name(): string;
	public abstract exists(): Promise<boolean>;
	public abstract getMetadata(): Promise<BucketFileMetadata>;
	public abstract createReadStream(opt?: { start: number; end: number }): Readable;
}

export abstract class AbstractBucket {
	public abstract getFile(relativePath: string): AbstractBucketFile;
}
