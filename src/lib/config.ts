import { readFileSync } from 'node:fs';
import { load as loadYaml } from 'js-yaml';

/**
 * Configuration file interface defining all optional config fields.
 */
export interface ConfigFile {
	bucket?: string;
	baseUrl?: string;
	directory?: string;
	port?: number;
	fastRecompression?: boolean;
	localDirectory?: string;
	verbose?: boolean;
	rewriteRules?: [string, string][];
}

/**
 * Loads and validates a configuration file from the specified path.
 * @param path - Path to the YAML configuration file
 * @returns Parsed and validated configuration object
 * @throws Error if file cannot be read, parsed, or contains invalid values
 */
export function loadConfig(path: string): ConfigFile {
	let content: string;
	try {
		content = readFileSync(path, 'utf-8');
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to read config file "${path}": ${message}`);
	}

	let parsed: unknown;
	try {
		parsed = loadYaml(content);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to parse config file "${path}": ${message}`);
	}

	// Empty file returns undefined/null - that's valid
	if (parsed == null) {
		return {};
	}

	if (typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`Config file "${path}" must contain a YAML object`);
	}

	return validateConfig(parsed as Record<string, unknown>, path);
}

/**
 * Validates the parsed configuration object.
 */
function validateConfig(config: Record<string, unknown>, path: string): ConfigFile {
	const result: ConfigFile = {};

	if ('bucket' in config) {
		if (typeof config.bucket !== 'string') {
			throw new Error(`Config file "${path}": "bucket" must be a string`);
		}
		result.bucket = config.bucket;
	}

	if ('baseUrl' in config) {
		if (typeof config.baseUrl !== 'string') {
			throw new Error(`Config file "${path}": "baseUrl" must be a string`);
		}
		result.baseUrl = config.baseUrl;
	}

	if ('directory' in config) {
		if (typeof config.directory !== 'string') {
			throw new Error(`Config file "${path}": "directory" must be a string`);
		}
		result.directory = config.directory;
	}

	if ('port' in config) {
		if (typeof config.port !== 'number' || !Number.isInteger(config.port)) {
			throw new Error(`Config file "${path}": "port" must be an integer`);
		}
		result.port = config.port;
	}

	if ('fastRecompression' in config) {
		if (typeof config.fastRecompression !== 'boolean') {
			throw new Error(`Config file "${path}": "fastRecompression" must be a boolean`);
		}
		result.fastRecompression = config.fastRecompression;
	}

	if ('localDirectory' in config) {
		if (typeof config.localDirectory !== 'string') {
			throw new Error(`Config file "${path}": "localDirectory" must be a string`);
		}
		result.localDirectory = config.localDirectory;
	}

	if ('verbose' in config) {
		if (typeof config.verbose !== 'boolean') {
			throw new Error(`Config file "${path}": "verbose" must be a boolean`);
		}
		result.verbose = config.verbose;
	}

	if ('rewriteRules' in config) {
		result.rewriteRules = validateRewriteRules(config.rewriteRules, path);
	}

	return result;
}

/**
 * Validates the rewrite rules configuration.
 */
function validateRewriteRules(rules: unknown, path: string): [string, string][] {
	if (!Array.isArray(rules)) {
		throw new Error(`Config file "${path}": "rewriteRules" must be an array`);
	}

	return rules.map((rule, index) => {
		if (!Array.isArray(rule) || rule.length !== 2) {
			throw new Error(`Config file "${path}": rewriteRules[${index}] must be a tuple of two strings`);
		}

		const [source, target] = rule;

		if (typeof source !== 'string' || typeof target !== 'string') {
			throw new Error(`Config file "${path}": rewriteRules[${index}] must contain two strings`);
		}

		if (!source.startsWith('/') || !target.startsWith('/')) {
			throw new Error(`Config file "${path}": rewriteRules[${index}] paths must start with "/"`);
		}

		return [source, target];
	});
}
