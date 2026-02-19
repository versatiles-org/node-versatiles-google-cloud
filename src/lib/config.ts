import { loadConfig as loadConfigC12 } from 'c12';
import { existsSync } from 'node:fs';

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
	rewriteRules?: Record<string, string>;
}

/**
 * Loads and validates a configuration file from the specified path.
 * Supports YAML, JSON, TOML, JS, and TS config formats.
 * Supports config inheritance via the "extends" property.
 * @param path - Path to the configuration file
 * @returns Parsed and validated configuration object
 * @throws Error if file cannot be read, parsed, or contains invalid values
 */
export async function loadConfig(path: string): Promise<ConfigFile> {
	// Check if file exists first - c12 returns empty config for non-existent files
	if (!existsSync(path)) {
		throw new Error(`Failed to read config file "${path}": ENOENT: no such file or directory`);
	}

	let result: Awaited<ReturnType<typeof loadConfigC12<ConfigFile>>>;
	try {
		result = await loadConfigC12<ConfigFile>({
			configFile: path,
			rcFile: false,
			globalRc: false,
			packageJson: false,
			dotenv: false,
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		// c12 throws when YAML parses to null (empty file, comments only, explicit null)
		// Treat these as empty config for backward compatibility
		if (
			message.includes('Cannot read properties of null') ||
			message.includes('Cannot read properties of undefined')
		) {
			return {};
		}
		throw new Error(`Failed to parse config file "${path}": ${message}`);
	}

	const config = result.config;

	// Empty file returns empty object (layers will be populated but config is empty)
	if (config == null || (typeof config === 'object' && Object.keys(config).length === 0)) {
		return {};
	}

	if (typeof config !== 'object' || Array.isArray(config)) {
		throw new Error(`Config file "${path}" must contain an object`);
	}

	return validateConfig(config as Record<string, unknown>, path);
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
function validateRewriteRules(rules: unknown, path: string): Record<string, string> {
	if (rules === null || typeof rules !== 'object' || Array.isArray(rules)) {
		throw new Error(`Config file "${path}": "rewriteRules" must be an object`);
	}

	const result: Record<string, string> = {};

	for (const [source, target] of Object.entries(rules)) {
		if (typeof target !== 'string') {
			throw new Error(`Config file "${path}": rewriteRules["${source}"] value must be a string`);
		}

		if (!source.startsWith('/')) {
			throw new Error(`Config file "${path}": rewriteRules key "${source}" must start with "/"`);
		}

		if (!target.startsWith('/')) {
			throw new Error(`Config file "${path}": rewriteRules["${source}"] value must start with "/"`);
		}

		result[source] = target;
	}

	return result;
}
