import type { Server } from 'http';
import type { AbstractBucket } from './bucket';
import express from 'express';
import { Responder } from './responder';
import { recompress } from './recompress';
import { serveVersatiles } from './versatiles';
import { BucketGoogle, BucketLocal } from './bucket';

/**
 * Interface defining the options for starting the server.
 */
export interface ServerOptions {
	baseUrl: string; // Base URL for the server
	bucket: AbstractBucket | string; // Google Cloud Storage bucket or its name
	bucketPrefix: string; // Prefix for objects in the bucket
	fastRecompression: boolean; // Flag for fast recompression
	localDirectory?: string; // Local directory path to use instead of GCS bucket
	port: number; // Port number for the server
	verbose: boolean; // Flag for verbose logging
}

/**
 * Starts an Express server with specified options.
 * @param opt - Configuration options for the server.
 * @returns A promise resolving to the Express server instance.
 */
export async function startServer(opt: ServerOptions): Promise<Server | null> {
	const { port, fastRecompression, verbose } = opt;
	let bucketPrefix = opt.bucketPrefix.replace(/^\/+|\/+$/g, '');
	if (bucketPrefix !== '') bucketPrefix += '/';

	const baseUrl = new URL(opt.baseUrl).href;

	// Initialize the bucket based on the provided options
	let bucket: AbstractBucket;
	if (typeof opt.localDirectory == 'string') {
		bucket = new BucketLocal(opt.localDirectory);
	} else if (typeof opt.bucket == 'string') {
		bucket = new BucketGoogle(opt.bucket);
	} else {
		// eslint-disable-next-line @typescript-eslint/prefer-destructuring
		bucket = opt.bucket;
	}

	let requestNo = 0;

	const app = express();
	app.set('query parser', (a: string): string => a);
	app.disable('x-powered-by');

	// Health check endpoint
	app.get('/healthcheck', (serverRequest, serverResponse) => {
		serverResponse
			.status(200)
			.type('text')
			.send('ok');
	});

	// Handler for all GET requests
	app.get(/.*/, (request, response): void => {
		void (async (): Promise<void> => {
			requestNo++;
			const responder = new Responder({
				fastRecompression,
				requestHeaders: request.headers,
				requestNo,
				response,
				verbose,
			});

			responder.log('new request');

			try {
				const filename = decodeURI(String(request.path)).trim().replace(/^\/+/, '');

				// Handle file requests
				responder.log(`public filename: ${filename}`);

				if (filename === '') {
					responder.error(404, `file "${filename}" not found`); return;
				}

				responder.log(`request filename: ${bucketPrefix + filename}`);
				const file = bucket.getFile(bucketPrefix + filename);

				if (!await file.exists()) {
					responder.error(404, `file "${filename}" not found`);
					return;
				}

				if (filename.endsWith('.versatiles')) {
					void serveVersatiles(file, baseUrl + filename, String(request.query), responder);
				} else {
					void serveFile();
				}

				async function serveFile(): Promise<void> {
					responder.log('serve file');

					const metadata = await file.getMetadata();
					responder.log(`metadata: ${metadata.toString()}`);

					metadata.setHeaders(responder.headers);

					void recompress(responder, file.createReadStream());
				}

			} catch (error) {
				console.error({ error });
				responder.error(500, 'Internal Server Error for request: ' + JSON.stringify(request.path));
			}
		})();
	});

	// Start the server and return the server instance
	return new Promise(res => {
		const server = app.listen(port, () => {
			console.log(`listening on port ${port}`);
			console.log(`you can find me at ${baseUrl}`);
			res(server);
		});
	});
}
