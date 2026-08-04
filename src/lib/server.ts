import type { Server } from 'http';
import type { AbstractBucket } from './bucket/index.js';
import express from 'express';
import { Responder } from './responder.js';
import {
	BucketGoogle,
	BucketLocal,
	PathTraversalError,
	normalizeBucketPath,
} from './bucket/index.js';
import { getVersatiles } from './versatiles/index.js';
import { readFileSync } from 'fs';
import { Rewrite } from './rewrite.js';

/**
 * Interface defining the options for starting the server.
 */
export interface ServerOptions {
	baseUrl: string; // Base URL for the server
	bucket: AbstractBucket | string; // Google Cloud Storage bucket or its name
	bucketPrefix: string; // Prefix for objects in the bucket
	fastRecompression: boolean; // Flag for fast recompression
	localDirectory?: string; // Local directory path to use instead of GCS bucket
	rewriteRules: Record<string, string>;
	port: number; // Port number for the server
	verbose: boolean; // Flag for verbose logging
}

/**
 * Starts an Express server with specified options.
 * @param opt - Configuration options for the server.
 * @returns A promise resolving to the Express server instance.
 */
export async function startServer(opt: ServerOptions): Promise<Server | null> {
	const { port, fastRecompression, rewriteRules, verbose } = opt;
	let bucketPrefix = opt.bucketPrefix.replace(/^\/+|\/+$/g, '');
	if (bucketPrefix !== '') bucketPrefix += '/';

	const rewrite = new Rewrite(rewriteRules, { verbose, cache: true });
	const baseUrl = new URL(opt.baseUrl).href;

	// Initialize the bucket based on the provided options
	let bucket: AbstractBucket;
	if (typeof opt.localDirectory == 'string') {
		bucket = new BucketLocal(opt.localDirectory);
	} else if (typeof opt.bucket == 'string') {
		bucket = new BucketGoogle(opt.bucket);
	} else {
		bucket = opt.bucket;
	}

	await bucket.check();

	let requestNo = 0;

	const app = express();
	app.set('query parser', (a: string): string => a);
	app.disable('x-powered-by');

	// Health check endpoint
	app.get('/healthcheck', (serverRequest, serverResponse) => {
		serverResponse.status(200).type('text').send('ok');
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

			let { url } = request;
			responder.log('new request: ' + url);

			try {
				const maybeRewritten = rewrite.match(url);
				if (maybeRewritten !== null) {
					responder.log(`rewriting url from "${url}" to "${maybeRewritten}"`);
					url = maybeRewritten;
				}

				const parsedUrl = new URL(url, 'http://example.org');
				const { pathname, search } = parsedUrl;

				// Only leading slashes are stripped. Colons used to be stripped too,
				// but that ran before decoding: "/a:b.txt" silently served "ab.txt"
				// while "/a%3Ab.txt" served "a:b.txt" — the same path, encoded two
				// ways, resolving to two different files. It offered no protection
				// either, since the encoded form always passed through untouched.
				//
				// decodeURIComponent throws URIError on malformed escapes such as
				// "/%zz". That is a malformed request, not a server fault.
				let filename: string;
				try {
					filename = decodeURIComponent(pathname.replace(/^\/+/, ''));
				} catch {
					responder.error(400, 'invalid URL encoding in request path');
					return;
				}

				// Confine the request to the configured prefix. This has to happen
				// before bucketPrefix is prepended, while ".." segments are still
				// attributable to the client. Throws PathTraversalError, handled below.
				filename = normalizeBucketPath(filename);

				responder.log(`request file: ${bucketPrefix + filename}`);

				const file = bucket.getFile(bucketPrefix + filename);

				if (filename.endsWith('.versatiles')) {
					const container = await getVersatiles(file, baseUrl + filename);
					await container.serve(search, responder);
				} else {
					await file.serve(responder);
				}
			} catch (error) {
				// A path resolving outside the bucket is a rejected client request,
				// not a server fault. Answer exactly like a missing file so probes
				// cannot distinguish the two, and log a single line rather than a
				// stack trace — the path is client-controlled, so an unauthenticated
				// caller could otherwise flood the logs at will.
				if (error instanceof PathTraversalError) {
					responder.log(`rejected path outside bucket: ${JSON.stringify(request.path)}`);
					responder.error(404, `file "${request.path}" not found`);
					return;
				}

				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				switch ((error as any).code) {
					case 'ENOENT':
					case 404:
						responder.error(404, `file "${request.path}" not found`);
						return;
				}
				console.error(error);
				responder.error(500, 'Internal Server Error for request: ' + JSON.stringify(request.path));
			}
		})();
	});

	// Start the server and return the server instance
	return new Promise((res, rej) => {
		const server = app
			.listen(port, () => {
				const { version } = JSON.parse(
					readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
				) as { version: string };
				console.log(`starting server @versatiles/google-cloud v${version}`);
				console.log(`listening on port ${port}`);
				console.log(`you can find me at ${baseUrl}`);
				res(server);
			})
			.on('error', (error) => {
				console.log(`server error: ${error.message}`);
				rej(error);
			});
	});
}
