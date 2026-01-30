import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig, type ConfigFile } from './config.js';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const testDir = join(process.cwd(), `temp/test-config-temp-${randomUUID()}`);

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
		it('throws error when file not found', async () => {
			await expect(loadConfig('/nonexistent/path/config.yaml'))
				.rejects.toThrow(/Failed to read config file.*ENOENT/);
		});

		it('throws error for invalid YAML syntax', async () => {
			const path = writeConfig('invalid.yaml', 'bucket: [unclosed');
			await expect(loadConfig(path))
				.rejects.toThrow(/Failed to parse config file/);
		});

		it('returns empty object for empty config file', async () => {
			const path = writeConfig('empty.yaml', '');
			const config = await loadConfig(path);
			expect(config).toEqual({});
		});

		it('returns empty object for config with only comments', async () => {
			const path = writeConfig('comments.yaml', '# just a comment\n# another comment');
			const config = await loadConfig(path);
			expect(config).toEqual({});
		});

		it('throws error when config is an array', async () => {
			const path = writeConfig('array.yaml', '- item1\n- item2');
			await expect(loadConfig(path))
				.rejects.toThrow(/must contain an object/);
		});

		it('parses all fields correctly', async () => {
			const path = writeConfig('full.yaml', `
bucket: my-bucket
baseUrl: https://example.com/
directory: /public/
port: 3000
fastRecompression: true
localDirectory: ./local
verbose: true
rewriteRules:
  "/tiles/:name": "/geodata/:name.versatiles"
  "/apps:any": "/apps:any/index.html"
`);
			const config = await loadConfig(path);
			expect(config).toEqual({
				bucket: 'my-bucket',
				baseUrl: 'https://example.com/',
				directory: '/public/',
				port: 3000,
				fastRecompression: true,
				localDirectory: './local',
				verbose: true,
				rewriteRules: {
					'/tiles/:name': '/geodata/:name.versatiles',
					'/apps:any': '/apps:any/index.html',
				},
			} satisfies ConfigFile);
		});

		it('parses partial config correctly', async () => {
			const path = writeConfig('partial.yaml', `
bucket: partial-bucket
port: 9000
`);
			const config = await loadConfig(path);
			expect(config).toEqual({
				bucket: 'partial-bucket',
				port: 9000,
			});
		});
	});

	describe('multi-format support', () => {
		it('loads JSON config files', async () => {
			const path = writeConfig('config.json', JSON.stringify({
				bucket: 'json-bucket',
				port: 3001,
				verbose: true,
			}));
			const config = await loadConfig(path);
			expect(config).toEqual({
				bucket: 'json-bucket',
				port: 3001,
				verbose: true,
			});
		});

		it('loads JS config files', async () => {
			const path = writeConfig('config.mjs', `
export default {
	bucket: 'js-bucket',
	port: 3002,
	fastRecompression: true,
};
`);
			const config = await loadConfig(path);
			expect(config).toEqual({
				bucket: 'js-bucket',
				port: 3002,
				fastRecompression: true,
			});
		});

		it('loads TS config files', async () => {
			const path = writeConfig('config.mts', `
export default {
	bucket: 'ts-bucket',
	port: 3003,
	directory: '/data/',
};
`);
			const config = await loadConfig(path);
			expect(config).toEqual({
				bucket: 'ts-bucket',
				port: 3003,
				directory: '/data/',
			});
		});
	});

	describe('extends capability', () => {
		it('inherits values from parent config', async () => {
			const basePath = writeConfig('base.yaml', `
bucket: base-bucket
port: 8080
verbose: false
`);
			const childPath = writeConfig('child.yaml', `
extends: ${basePath}
verbose: true
`);
			const config = await loadConfig(childPath);
			expect(config).toEqual({
				bucket: 'base-bucket',
				port: 8080,
				verbose: true,
			});
		});

		it('child values override parent values', async () => {
			const basePath = writeConfig('base2.yaml', `
bucket: parent-bucket
port: 8080
baseUrl: https://parent.example.com/
`);
			const childPath = writeConfig('child2.yaml', `
extends: ${basePath}
bucket: child-bucket
port: 9090
`);
			const config = await loadConfig(childPath);
			expect(config).toEqual({
				bucket: 'child-bucket',
				port: 9090,
				baseUrl: 'https://parent.example.com/',
			});
		});

		it('merges rewriteRules from parent and child', async () => {
			const basePath = writeConfig('base3.yaml', `
bucket: base-bucket
rewriteRules:
  "/parent/path": "/parent/target"
`);
			const childPath = writeConfig('child3.yaml', `
extends: ${basePath}
rewriteRules:
  "/child/path": "/child/target"
`);
			const config = await loadConfig(childPath);
			expect(config.bucket).toBe('base-bucket');
			// c12 uses defu for merging, which merges child rules with parent rules
			expect(config.rewriteRules).toEqual({
				'/child/path': '/child/target',
				'/parent/path': '/parent/target',
			});
		});

		it('supports multi-level inheritance', async () => {
			const grandparentPath = writeConfig('grandparent.yaml', `
bucket: grandparent-bucket
port: 1000
verbose: false
`);
			const parentPath = writeConfig('parent.yaml', `
extends: ${grandparentPath}
port: 2000
fastRecompression: true
`);
			const childPath = writeConfig('grandchild.yaml', `
extends: ${parentPath}
verbose: true
`);
			const config = await loadConfig(childPath);
			expect(config).toEqual({
				bucket: 'grandparent-bucket',
				port: 2000,
				verbose: true,
				fastRecompression: true,
			});
		});
	});

	describe('type validation', () => {
		it('throws error when bucket is not a string', async () => {
			const path = writeConfig('invalid-bucket.yaml', 'bucket: 123');
			await expect(loadConfig(path))
				.rejects.toThrow(/"bucket" must be a string/);
		});

		it('throws error when baseUrl is not a string', async () => {
			const path = writeConfig('invalid-baseUrl.yaml', 'baseUrl: true');
			await expect(loadConfig(path))
				.rejects.toThrow(/"baseUrl" must be a string/);
		});

		it('throws error when directory is not a string', async () => {
			const path = writeConfig('invalid-directory.yaml', 'directory: 456');
			await expect(loadConfig(path))
				.rejects.toThrow(/"directory" must be a string/);
		});

		it('throws error when port is not an integer', async () => {
			const path = writeConfig('invalid-port-string.yaml', 'port: "8080"');
			await expect(loadConfig(path))
				.rejects.toThrow(/"port" must be an integer/);
		});

		it('throws error when port is a float', async () => {
			const path = writeConfig('invalid-port-float.yaml', 'port: 8080.5');
			await expect(loadConfig(path))
				.rejects.toThrow(/"port" must be an integer/);
		});

		it('throws error when fastRecompression is not a boolean', async () => {
			const path = writeConfig('invalid-fast.yaml', 'fastRecompression: "yes"');
			await expect(loadConfig(path))
				.rejects.toThrow(/"fastRecompression" must be a boolean/);
		});

		it('throws error when localDirectory is not a string', async () => {
			const path = writeConfig('invalid-local.yaml', 'localDirectory: 123');
			await expect(loadConfig(path))
				.rejects.toThrow(/"localDirectory" must be a string/);
		});

		it('throws error when verbose is not a boolean', async () => {
			const path = writeConfig('invalid-verbose.yaml', 'verbose: 1');
			await expect(loadConfig(path))
				.rejects.toThrow(/"verbose" must be a boolean/);
		});
	});

	describe('rewrite rules validation', () => {
		it('throws error when rewriteRules is not an object', async () => {
			const path = writeConfig('invalid-rules-string.yaml', 'rewriteRules: not-an-object');
			await expect(loadConfig(path))
				.rejects.toThrow(/"rewriteRules" must be an object/);
		});

		it('throws error when rewriteRules is an array', async () => {
			const path = writeConfig('invalid-rules-array.yaml', `
rewriteRules:
  - ["/source", "/target"]
`);
			await expect(loadConfig(path))
				.rejects.toThrow(/"rewriteRules" must be an object/);
		});

		it('throws error when value is not a string', async () => {
			const path = writeConfig('invalid-rule-value.yaml', `
rewriteRules:
  "/source": 123
`);
			await expect(loadConfig(path))
				.rejects.toThrow(/rewriteRules\["\/source"\] value must be a string/);
		});

		it('throws error when key does not start with /', async () => {
			const path = writeConfig('invalid-rule-key.yaml', `
rewriteRules:
  "source": "/target"
`);
			await expect(loadConfig(path))
				.rejects.toThrow(/rewriteRules key "source" must start with "\/"/);
		});

		it('throws error when value does not start with /', async () => {
			const path = writeConfig('invalid-rule-target.yaml', `
rewriteRules:
  "/source": "target"
`);
			await expect(loadConfig(path))
				.rejects.toThrow(/rewriteRules\["\/source"\] value must start with "\/"/);
		});

		it('validates all rules in object', async () => {
			const path = writeConfig('invalid-second-rule.yaml', `
rewriteRules:
  "/valid/source": "/valid/target"
  "invalid": "/target"
`);
			await expect(loadConfig(path))
				.rejects.toThrow(/rewriteRules key "invalid" must start with "\/"/);
		});

		it('accepts valid rewrite rules', async () => {
			const path = writeConfig('valid-rules.yaml', `
rewriteRules:
  "/tiles/:name": "/geodata/:name.versatiles"
`);
			const config = await loadConfig(path);
			expect(config.rewriteRules).toEqual({
				'/tiles/:name': '/geodata/:name.versatiles',
			});
		});
	});
});
