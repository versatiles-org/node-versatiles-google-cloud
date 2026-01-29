import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, type ConfigFile } from './config.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const testDir = join(process.cwd(), `test-config-temp-${randomUUID()}`);

describe('config.ts', () => {
	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	function writeConfig(filename: string, content: string): string {
		const filepath = join(testDir, filename);
		writeFileSync(filepath, content, 'utf-8');
		return filepath;
	}

	describe('loadConfig', () => {
		it('throws error when file not found', () => {
			expect(() => loadConfig('/nonexistent/path/config.yaml'))
				.toThrow(/Failed to read config file.*ENOENT/);
		});

		it('throws error for invalid YAML syntax', () => {
			const path = writeConfig('invalid.yaml', 'bucket: [unclosed');
			expect(() => loadConfig(path))
				.toThrow(/Failed to parse config file/);
		});

		it('returns empty object for empty config file', () => {
			const path = writeConfig('empty.yaml', '');
			const config = loadConfig(path);
			expect(config).toEqual({});
		});

		it('returns empty object for config with only comments', () => {
			const path = writeConfig('comments.yaml', '# just a comment\n# another comment');
			const config = loadConfig(path);
			expect(config).toEqual({});
		});

		it('throws error when config is not an object', () => {
			const path = writeConfig('array.yaml', '- item1\n- item2');
			expect(() => loadConfig(path))
				.toThrow(/must contain a YAML object/);
		});

		it('parses all fields correctly', () => {
			const path = writeConfig('full.yaml', `
bucket: my-bucket
baseUrl: https://example.com/
directory: /public/
port: 3000
fastRecompression: true
localDirectory: ./local
verbose: true
rewriteRules:
  - ["/tiles/:name", "/geodata/:name.versatiles"]
  - ["/apps:any", "/apps:any/index.html"]
`);
			const config = loadConfig(path);
			expect(config).toEqual({
				bucket: 'my-bucket',
				baseUrl: 'https://example.com/',
				directory: '/public/',
				port: 3000,
				fastRecompression: true,
				localDirectory: './local',
				verbose: true,
				rewriteRules: [
					['/tiles/:name', '/geodata/:name.versatiles'],
					['/apps:any', '/apps:any/index.html'],
				],
			} satisfies ConfigFile);
		});

		it('parses partial config correctly', () => {
			const path = writeConfig('partial.yaml', `
bucket: partial-bucket
port: 9000
`);
			const config = loadConfig(path);
			expect(config).toEqual({
				bucket: 'partial-bucket',
				port: 9000,
			});
		});
	});

	describe('type validation', () => {
		it('throws error when bucket is not a string', () => {
			const path = writeConfig('invalid-bucket.yaml', 'bucket: 123');
			expect(() => loadConfig(path))
				.toThrow(/"bucket" must be a string/);
		});

		it('throws error when baseUrl is not a string', () => {
			const path = writeConfig('invalid-baseUrl.yaml', 'baseUrl: true');
			expect(() => loadConfig(path))
				.toThrow(/"baseUrl" must be a string/);
		});

		it('throws error when directory is not a string', () => {
			const path = writeConfig('invalid-directory.yaml', 'directory: 456');
			expect(() => loadConfig(path))
				.toThrow(/"directory" must be a string/);
		});

		it('throws error when port is not an integer', () => {
			const path = writeConfig('invalid-port-string.yaml', 'port: "8080"');
			expect(() => loadConfig(path))
				.toThrow(/"port" must be an integer/);
		});

		it('throws error when port is a float', () => {
			const path = writeConfig('invalid-port-float.yaml', 'port: 8080.5');
			expect(() => loadConfig(path))
				.toThrow(/"port" must be an integer/);
		});

		it('throws error when fastRecompression is not a boolean', () => {
			const path = writeConfig('invalid-fast.yaml', 'fastRecompression: "yes"');
			expect(() => loadConfig(path))
				.toThrow(/"fastRecompression" must be a boolean/);
		});

		it('throws error when localDirectory is not a string', () => {
			const path = writeConfig('invalid-local.yaml', 'localDirectory: 123');
			expect(() => loadConfig(path))
				.toThrow(/"localDirectory" must be a string/);
		});

		it('throws error when verbose is not a boolean', () => {
			const path = writeConfig('invalid-verbose.yaml', 'verbose: 1');
			expect(() => loadConfig(path))
				.toThrow(/"verbose" must be a boolean/);
		});
	});

	describe('rewrite rules validation', () => {
		it('throws error when rewriteRules is not an array', () => {
			const path = writeConfig('invalid-rules-object.yaml', 'rewriteRules: not-an-array');
			expect(() => loadConfig(path))
				.toThrow(/"rewriteRules" must be an array/);
		});

		it('throws error when rule is not a tuple', () => {
			const path = writeConfig('invalid-rule-not-tuple.yaml', `
rewriteRules:
  - /single/path
`);
			expect(() => loadConfig(path))
				.toThrow(/rewriteRules\[0\] must be a tuple of two strings/);
		});

		it('throws error when rule has wrong length', () => {
			const path = writeConfig('invalid-rule-length.yaml', `
rewriteRules:
  - ["/one", "/two", "/three"]
`);
			expect(() => loadConfig(path))
				.toThrow(/rewriteRules\[0\] must be a tuple of two strings/);
		});

		it('throws error when rule contains non-strings', () => {
			const path = writeConfig('invalid-rule-types.yaml', `
rewriteRules:
  - [123, "/target"]
`);
			expect(() => loadConfig(path))
				.toThrow(/rewriteRules\[0\] must contain two strings/);
		});

		it('throws error when source does not start with /', () => {
			const path = writeConfig('invalid-rule-source.yaml', `
rewriteRules:
  - ["source", "/target"]
`);
			expect(() => loadConfig(path))
				.toThrow(/rewriteRules\[0\] paths must start with "\/"/);
		});

		it('throws error when target does not start with /', () => {
			const path = writeConfig('invalid-rule-target.yaml', `
rewriteRules:
  - ["/source", "target"]
`);
			expect(() => loadConfig(path))
				.toThrow(/rewriteRules\[0\] paths must start with "\/"/);
		});

		it('validates all rules in array', () => {
			const path = writeConfig('invalid-second-rule.yaml', `
rewriteRules:
  - ["/valid/source", "/valid/target"]
  - ["invalid", "/target"]
`);
			expect(() => loadConfig(path))
				.toThrow(/rewriteRules\[1\] paths must start with "\/"/);
		});

		it('accepts valid rewrite rules', () => {
			const path = writeConfig('valid-rules.yaml', `
rewriteRules:
  - ["/tiles/:name", "/geodata/:name.versatiles"]
`);
			const config = loadConfig(path);
			expect(config.rewriteRules).toEqual([
				['/tiles/:name', '/geodata/:name.versatiles'],
			]);
		});
	});
});
