import type { Reader as VersatilesReader } from '@versatiles/container';
import type { AbstractBucketFile } from '../bucket/index.js';
import { Versatiles } from './versatiles.js';

const containerCache = new Map<string, Versatiles>();

export async function getVersatiles(file: AbstractBucketFile, url: string): Promise<Versatiles> {
	let container = containerCache.get(file.name);
	if (container != null) return container;

	const reader = buildReader(file);
	container = await Versatiles.fromReader(reader, url);
	containerCache.set(file.name, container);
	return container;
}

function buildReader(file: AbstractBucketFile): VersatilesReader {
	return async (position: number, length: number): Promise<Buffer> => {
		// Read data from the file stream
		return new Promise<Buffer>((resolve, reject) => {
			const buffers = Array<Buffer>();
			file.createReadStream({ start: position, end: position + length - 1 })
				.on('data', (chunk: Buffer) => buffers.push(chunk))
				.on('end', () => {
					resolve(Buffer.concat(buffers));
				})
				.on('error', (err: unknown) => {
					reject(`error accessing bucket stream - ${String(err)}`);
				});
		});
	};
}