import type { Server } from 'http';
import type { AbstractBucket } from './bucket/index.js';
import express from 'express';
import { Responder } from './responder.js';
import {
	BucketGoogle,
	BucketLocal,
	PathTraversalError,
	StaleRevisionError,
	normalizeBucketPath,
} from './bucket/index.js';
import { ContainerCache } from './versatiles/index.js';
import { readFileSync } from 'fs';
import { Rewrite } from './rewrite.js';
import { ReadinessCheck } from './readiness.js';

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

	// Owned by this server rather than shared module-wide, so several servers in
	// one process (as the tests create) cannot read each other's entries.
	const containerCache = new ContainerCache();

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

	// Liveness: is this process still running? Deliberately checks nothing else.
	// Wiring the bucket in here would let a transient Cloud Storage problem fail
	// every instance at once, turning a degraded dependency into a dead service —
	// use /readiness for that instead.
	app.get('/healthcheck', (serverRequest, serverResponse) => {
		serverResponse.status(200).type('text').send('ok');
	});

	// Readiness: should this instance receive traffic? Reports the bucket's
	// reachability, so credentials that expire after startup are noticed.
	const readiness = new ReadinessCheck(() => bucket.check());

	app.get('/readiness', (serverRequest, serverResponse) => {
		void (async (): Promise<void> => {
			const state = await readiness.get();

			if (state.ready) {
				serverResponse.status(200).type('text').send('ok');
				return;
			}

			// Logged, not returned: the reason can name buckets and credentials,
			// and this endpoint is unauthenticated.
			console.error(`readiness check failed: ${state.error ?? 'unknown error'}`);
			serverResponse.status(503).type('text').send('bucket unavailable');
		})();
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
					// Reads are pinned to the revision the tile index came from, so a
					// container replaced since then fails loudly instead of returning
					// bytes that do not match the index. Drop the cached index and try
					// once more against the current revision.
					try {
						const container = await containerCache.getVersatiles(file);
						await container.serve(search, baseUrl + filename, responder);
					} catch (error) {
						if (!(error instanceof StaleRevisionError) || responder.headersSent) throw error;

						responder.log('container changed while serving; retrying with a fresh index');
						containerCache.invalidate(file.name);

						const container = await containerCache.getVersatiles(file);
						await container.serve(search, baseUrl + filename, responder);
					}
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
		let settled = false;

		const server = app.listen(port, () => {
			const { version } = JSON.parse(
				readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
			) as { version: string };
			console.log(`starting server @versatiles/google-cloud v${version}`);
			console.log(`listening on port ${port}`);
			console.log(`you can find me at ${baseUrl}`);
			settled = true;
			res(server);
		});

		server.on('error', (error) => {
			if (!settled) {
				settled = true;
				rej(error);
				return;
			}

			// Some platforms emit "listening" before reporting that the bind failed,
			// so this can arrive after the promise has already resolved — at which
			// point rejecting is a no-op and the process would otherwise exit 0 while
			// serving nothing. Re-throw so it becomes a fatal error instead.
			console.error(`server error after startup: ${error.message}`);
			server.close();
			throw error;
		});
	});
}
