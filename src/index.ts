#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './lib/server.js';

/**
 * Entry point for the VersaTiles Google Cloud CLI application.
 *
 * This script sets up a server to serve files from a specified Google Cloud Storage bucket
 * through a Google Load Balancer and Content Delivery Network (CDN). It handles HTTP headers,
 * optimizes content compression, and provides a RESTful API interface to serve tiles from
 * VersaTiles containers.
 *
 * For more details, visit:
 * https://github.com/versatiles-org/node-versatiles-google-cloud/
 */
export const program = new Command();

const REWRITE_DELIMITER = ' ';

function collect(v: string, m: string[]): string[] {
	m.push(v);
	return m;
}

program
	.showHelpAfterError()
	.name('versatiles-google-cloud')
	.description('Initialises a server to serve files from a specified Google Bucket to a Google Load Balancer with CDN, '
		+ 'handles HTTP headers and compression, and provides a RESTful API for VersaTiles containers.\n'
		+ 'For more details, visit: https://github.com/versatiles-org/node-versatiles-google-cloud/')
	.argument('<bucket-name>', 'Name of the Google Cloud Storage bucket.')
	.option('-b, --base-url <url>', 'Set the public base URL. Defaults to "http://localhost:<port>/".')
	.option('-d, --directory <prefix>', 'Set the bucket directory (prefix), e.g., "/public/".')
	.option('-f, --fast-recompression', 'Enable faster server responses by avoiding recompression.')
	.option('-l, --local-directory <path>', 'Ignore bucket and use a local directory instead. Useful for local development and testing.')
	.option('-p, --port <port>', 'Set the server port. Default: 8080')
	.option(`-r, --rewrite-rule <path${REWRITE_DELIMITER}path>`, `Set a rewrite rule. Must start with a "/". E.g. "/tiles/osm/${REWRITE_DELIMITER}/folder/osm.versatiles?"`, collect, [])
	.option('-v, --verbose', 'Enable verbose mode for detailed operational logs.')
	.action((bucketName: string, cmdOptions: Record<string, unknown>) => {
		// Parse and set command line options
		const port = Number(cmdOptions.port ?? 8080);

		const baseUrl = String(cmdOptions.baseUrl ?? `http://localhost:${port}/`);
		const bucketPrefix = String(cmdOptions.directory ?? '');
		const fastRecompression = Boolean(cmdOptions.fastRecompression ?? false);
		const localDirectory: string | undefined = cmdOptions.localDirectory ? String(cmdOptions.localDirectory) : undefined;
		const verbose = Boolean(cmdOptions.verbose ?? false);

		const rewriteRules: [string, string][] = Array.from(cmdOptions.rewriteRule as Iterable<unknown>).map(r => {
			const parts = String(r).split(REWRITE_DELIMITER);
			if (parts.length !== 2) throw Error(`a rewrite rule must be formatted as "$request${REWRITE_DELIMITER}$origin"`);
			if (!parts[0].startsWith('/') || !parts[1].startsWith('/')) throw Error(`each side of a rewrite rule must start with a "/", e.g. "/public${REWRITE_DELIMITER}/origin", but this rule is formatted as "${String(r)}"`);
			return parts as [string, string];
		});

		if (verbose) {
			// Log parameters for verbose mode
			console.table({
				baseUrl,
				bucketPrefix,
				fastRecompression,
				localDirectory,
				port,
				verbose,
				...Object.fromEntries(rewriteRules.map((r, i) => ['rewriteRule ' + (i + 1), r.join(' => ')])),
			});
		}

		try {
			// Start the server with the provided options
			void startServer({
				baseUrl,
				bucket: bucketName,
				bucketPrefix,
				fastRecompression,
				localDirectory,
				port,
				rewriteRules,
				verbose,
			});
		} catch (error: unknown) {
			// Handle errors during server initialization
			const errorMessage = String((typeof error == 'object' && error != null && 'message' in error) ? error.message : error);
			console.error(`Error starting the server: ${errorMessage}`);
			process.exit(1);
		}
	});

// Prevent running the CLI program during tests
if (process.env.NODE_ENV !== 'test') {
	program.parse();
}