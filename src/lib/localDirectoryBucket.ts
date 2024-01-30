/* eslint-disable @typescript-eslint/require-await */

import type { Bucket, FileMetadata } from '@google-cloud/storage';
import { createReadStream, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import type { Readable } from 'stream';

/**
 * Creates a mock Google Cloud Storage bucket using a local directory.
 * This is useful for local development and testing, mimicking the behavior of an actual Bucket.
 *
 * @param basePath - The base path of the local directory to use as the bucket.
 * @returns An object mimicking the Bucket interface from @google-cloud/storage.
 */
export function createLocalDirectoryBucket(basePath: string): Bucket {
	return {
		file: (relativePath: string): File => {
			// Resolve the full path from the base path and the relative path
			const path = resolve(basePath, relativePath);
			return {
				// Check if the file exists
				exists: async (): Promise<[boolean]> => [existsSync(path)],
				// Get metadata for the file
				getMetadata: async (): Promise<[FileMetadata]> => {
					const stat = statSync(path);
					return [{ size: stat.size }];
				},
				// Create a readable stream for the file
				createReadStream: (opt?: { start: number; end: number }): Readable => createReadStream(path, opt),
			} as unknown as File; // Cast to File type to satisfy the Bucket interface
		},
	} as unknown as Bucket; // Cast to Bucket type to mimic the Google Cloud Storage Bucket interface
}
