#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from './lib/server.js';
import { loadConfig, type ConfigFile } from './lib/config.js';

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
	.argument('[bucket-name]', 'Name of the Google Cloud Storage bucket.')
	.option('-b, --base-url <url>', 'Set the public base URL. Defaults to "http://localhost:<port>/".')
	.option('-c, --config <path>', 'Load configuration from a YAML file. CLI arguments override config file values.')
	.option('-d, --directory <prefix>', 'Set the bucket directory (prefix), e.g., "/public/".')
	.option('-f, --fast-recompression', 'Enable faster server responses by avoiding recompression.')
	.option('-l, --local-directory <path>', 'Ignore bucket and use a local directory instead. Useful for local development and testing.')
	.option('-p, --port <port>', 'Set the server port. Default: 8080')
	.option(`-r, --rewrite-rule <path${REWRITE_DELIMITER}path>`, `Set a rewrite rule. Must start with a "/". E.g. "/tiles/osm/${REWRITE_DELIMITER}/folder/osm.versatiles?"`, collect, [])
	.option('-v, --verbose', 'Enable verbose mode for detailed operational logs.')
	.action(async (bucketName: string | undefined, cmdOptions: Record<string, unknown>) => {
		// Load config file if provided
		let config: ConfigFile = {};
		if (cmdOptions.config) {
			try {
				config = await loadConfig(String(cmdOptions.config));
			} catch (error: unknown) {
				const errorMessage = String((typeof error == 'object' && error != null && 'message' in error) ? error.message : error);
				console.error(errorMessage);
				process.exit(1);
			}
		}

		// Merge options with precedence: CLI > config > defaults
		const port = cmdOptions.port != null ? Number(cmdOptions.port) : config.port ?? 8080;
		const baseUrl = (cmdOptions.baseUrl ?? config.baseUrl ?? `http://localhost:${port}/`) as string;
		const bucketPrefix = (cmdOptions.directory ?? config.directory ?? '') as string;
		const fastRecompression = (cmdOptions.fastRecompression ?? config.fastRecompression ?? false) as boolean;
		const localDirectory = (cmdOptions.localDirectory ?? config.localDirectory) as string | undefined;
		const verbose = (cmdOptions.verbose ?? config.verbose ?? false) as boolean;
		const bucket = bucketName ?? config.bucket;

		// Validate that bucket is provided (unless using local directory)
		if (!bucket && !localDirectory) {
			console.error('Error: bucket-name is required unless --local-directory is specified.\n'
				+ 'Provide bucket-name as argument or in config file.');
			process.exit(1);
		}

		// CLI rewrite rules completely replace config rules (no merging)
		const cliRewriteRules = cmdOptions.rewriteRule as string[];
		let rewriteRules: Record<string, string>;

		if (cliRewriteRules.length > 0) {
			// Use CLI rules
			rewriteRules = {};
			for (const r of cliRewriteRules) {
				const parts = String(r).split(REWRITE_DELIMITER);
				if (parts.length !== 2) throw Error(`a rewrite rule must be formatted as "$request${REWRITE_DELIMITER}$origin"`);
				if (!parts[0].startsWith('/') || !parts[1].startsWith('/')) throw Error(`each side of a rewrite rule must start with a "/", e.g. "/public${REWRITE_DELIMITER}/origin", but this rule is formatted as "${String(r)}"`);
				rewriteRules[parts[0]] = parts[1];
			}
		} else {
			// Use config rules (or empty object)
			rewriteRules = config.rewriteRules ?? {};
		}

		if (verbose) {
			// Log parameters for verbose mode
			const ruleEntries = Object.entries(rewriteRules);
			console.table({
				baseUrl,
				bucket,
				bucketPrefix,
				fastRecompression,
				localDirectory,
				port,
				verbose,
				...(cmdOptions.config ? { configFile: cmdOptions.config } : {}),
				...Object.fromEntries(ruleEntries.map(([source, target], i) => ['rewriteRule ' + (i + 1), `${source} => ${target}`])),
			});
		}

		try {
			// Start the server with the provided options
			void startServer({
				baseUrl,
				bucket: bucket ?? '',
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
