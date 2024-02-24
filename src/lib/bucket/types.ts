import type { Readable } from 'stream';
import type { BucketFileMetadata } from './metadata';
import type { Responder } from '../responder';
import { recompress } from '../recompress';

export abstract class AbstractBucketFile {
	public abstract get name(): string;

	public async serve(responder: Responder): Promise<void> {
		responder.log('serve file');

		const metadata = await this.getMetadata();
		responder.log(`metadata: ${metadata.toString()}`);

		metadata.setHeaders(responder.headers);

		void recompress(responder, this.createReadStream());
	}

	public abstract exists(): Promise<boolean>;

	public abstract getMetadata(): Promise<BucketFileMetadata>;

	public abstract createReadStream(opt?: { start: number; end: number }): Readable;
}

export abstract class AbstractBucket {
	public abstract getFile(relativePath: string): AbstractBucketFile;
}
