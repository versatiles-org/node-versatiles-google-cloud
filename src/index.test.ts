import type { Command } from 'commander';
import type { startServer } from './lib/server.js';
import { vi, it, describe, beforeEach, afterEach, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const mockedStartServer = vi.fn<typeof startServer>().mockResolvedValue(null);
vi.mock('./lib/server.js', () => ({ startServer: mockedStartServer }));

vi.spyOn(process, 'exit').mockImplementation(vi.fn<typeof process.exit>());

vi.spyOn(console, 'log').mockReturnValue();
vi.spyOn(console, 'table').mockReturnValue();
vi.spyOn(console, 'error').mockReturnValue();

const testDir = join(process.cwd(), `test-index-temp-${randomUUID()}`);

describe('index.ts', () => {
	const defaultResults = {
		baseUrl: 'http://localhost:8080/',
		bucket: 'test-bucket',
		bucketPrefix: '',
		fastRecompression: false,
		localDirectory: undefined,
		port: 8080,
		rewriteRules: [],
		verbose: false,
	};

	beforeEach(() => {
		mockedStartServer.mockReset();
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

	it('starts server with default options', async () => {
		await run('test-bucket');
		expect(mockedStartServer).toHaveBeenCalledTimes(1);
		expect(mockedStartServer).toHaveBeenCalledWith({ ...defaultResults });
	});

	it('starts server in local directory mode', async () => {
		await run('test-bucket', '-l', '.');
		expect(mockedStartServer).toHaveBeenCalledTimes(1);
		expect(mockedStartServer).toHaveBeenCalledWith({ ...defaultResults, localDirectory: '.' });
	});

	it('starts server with base URL', async () => {
		await run('test-bucket', '-b', 'https://example.org');
		expect(mockedStartServer).toHaveBeenCalledTimes(1);
		expect(mockedStartServer).toHaveBeenCalledWith({ ...defaultResults, baseUrl: 'https://example.org' });
	});

	it('starts server with bucket prefix', async () => {
		await run('test-bucket', '-d', '/public/');
		expect(mockedStartServer).toHaveBeenCalledTimes(1);
		expect(mockedStartServer).toHaveBeenCalledWith({ ...defaultResults, bucketPrefix: '/public/' });
	});

	it('starts server with fast recompression', async () => {
		await run('test-bucket', '-f');
		expect(mockedStartServer).toHaveBeenCalledTimes(1);
		expect(mockedStartServer).toHaveBeenCalledWith({ ...defaultResults, fastRecompression: true });
	});

	it('starts server with different port', async () => {
		await run('test-bucket', '-p', '3000');
		expect(mockedStartServer).toHaveBeenCalledTimes(1);
		expect(mockedStartServer).toHaveBeenCalledWith({ ...defaultResults, baseUrl: 'http://localhost:3000/', port: 3000 });
	});

	it('starts server with different port', async () => {
		await run('test-bucket', '-b', 'https://example.org', '-p', '3000');
		expect(mockedStartServer).toHaveBeenCalledTimes(1);
		expect(mockedStartServer).toHaveBeenCalledWith({ ...defaultResults, baseUrl: 'https://example.org', port: 3000 });
	});

	it('starts server in verbose mode', async () => {
		await run('test-bucket', '-v');
		expect(mockedStartServer).toHaveBeenCalledTimes(1);
		expect(mockedStartServer).toHaveBeenCalledWith({ ...defaultResults, verbose: true });
	});

	describe('config file', () => {
		it('loads config file when --config is provided', async () => {
			const configPath = writeConfig('config.yaml', `
bucket: config-bucket
port: 9000
`);
			await run('--config', configPath);
			expect(mockedStartServer).toHaveBeenCalledTimes(1);
			expect(mockedStartServer).toHaveBeenCalledWith({
				...defaultResults,
				bucket: 'config-bucket',
				port: 9000,
				baseUrl: 'http://localhost:9000/',
			});
		});

		it('CLI bucket overrides config bucket', async () => {
			const configPath = writeConfig('config.yaml', `
bucket: config-bucket
`);
			await run('cli-bucket', '--config', configPath);
			expect(mockedStartServer).toHaveBeenCalledTimes(1);
			expect(mockedStartServer).toHaveBeenCalledWith({
				...defaultResults,
				bucket: 'cli-bucket',
			});
		});

		it('CLI options override config values', async () => {
			const configPath = writeConfig('config.yaml', `
bucket: config-bucket
port: 9000
directory: /config-dir/
fastRecompression: false
verbose: false
`);
			await run('--config', configPath, '-p', '3000', '-d', '/cli-dir/', '-f', '-v');
			expect(mockedStartServer).toHaveBeenCalledTimes(1);
			expect(mockedStartServer).toHaveBeenCalledWith({
				...defaultResults,
				bucket: 'config-bucket',
				port: 3000,
				baseUrl: 'http://localhost:3000/',
				bucketPrefix: '/cli-dir/',
				fastRecompression: true,
				verbose: true,
			});
		});

		it('CLI rewrite rules replace config rules', async () => {
			const configPath = writeConfig('config.yaml', `
bucket: config-bucket
rewriteRules:
  - ["/config/source", "/config/target"]
`);
			await run('--config', configPath, '-r', '/cli/source /cli/target');
			expect(mockedStartServer).toHaveBeenCalledTimes(1);
			expect(mockedStartServer).toHaveBeenCalledWith({
				...defaultResults,
				bucket: 'config-bucket',
				rewriteRules: [['/cli/source', '/cli/target']],
			});
		});

		it('config rewrite rules used when no CLI rules', async () => {
			const configPath = writeConfig('config.yaml', `
bucket: config-bucket
rewriteRules:
  - ["/config/source", "/config/target"]
  - ["/another/source", "/another/target"]
`);
			await run('--config', configPath);
			expect(mockedStartServer).toHaveBeenCalledTimes(1);
			expect(mockedStartServer).toHaveBeenCalledWith({
				...defaultResults,
				bucket: 'config-bucket',
				rewriteRules: [
					['/config/source', '/config/target'],
					['/another/source', '/another/target'],
				],
			});
		});

		it('uses bucket from config when no CLI bucket arg', async () => {
			const configPath = writeConfig('config.yaml', `
bucket: config-bucket
baseUrl: https://example.com/
`);
			await run('--config', configPath);
			expect(mockedStartServer).toHaveBeenCalledTimes(1);
			expect(mockedStartServer).toHaveBeenCalledWith({
				...defaultResults,
				bucket: 'config-bucket',
				baseUrl: 'https://example.com/',
			});
		});

		it('allows local directory without bucket in config', async () => {
			const configPath = writeConfig('config.yaml', `
localDirectory: ./local
`);
			await run('--config', configPath);
			expect(mockedStartServer).toHaveBeenCalledTimes(1);
			expect(mockedStartServer).toHaveBeenCalledWith({
				...defaultResults,
				bucket: '',
				localDirectory: './local',
			});
		});

		it('CLI local directory overrides config local directory', async () => {
			const configPath = writeConfig('config.yaml', `
localDirectory: ./config-local
`);
			await run('--config', configPath, '-l', './cli-local');
			expect(mockedStartServer).toHaveBeenCalledTimes(1);
			expect(mockedStartServer).toHaveBeenCalledWith({
				...defaultResults,
				bucket: '',
				localDirectory: './cli-local',
			});
		});

		it('exits with error when config file not found', async () => {
			await run('--config', '/nonexistent/config.yaml');
			expect(process.exit).toHaveBeenCalledWith(1);
			expect(console.error).toHaveBeenCalled();
		});

		it('exits with error when no bucket and no local directory', async () => {
			const configPath = writeConfig('empty.yaml', '');
			await run('--config', configPath);
			expect(process.exit).toHaveBeenCalledWith(1);
			expect(console.error).toHaveBeenCalledWith(expect.stringContaining('bucket-name is required'));
		});

		it('loads all config options correctly', async () => {
			const configPath = writeConfig('full.yaml', `
bucket: full-bucket
baseUrl: https://full.example.com/
directory: /full-dir/
port: 7777
fastRecompression: true
localDirectory: ./full-local
verbose: true
rewriteRules:
  - ["/a", "/b"]
`);
			await run('--config', configPath);
			expect(mockedStartServer).toHaveBeenCalledTimes(1);
			expect(mockedStartServer).toHaveBeenCalledWith({
				baseUrl: 'https://full.example.com/',
				bucket: 'full-bucket',
				bucketPrefix: '/full-dir/',
				fastRecompression: true,
				localDirectory: './full-local',
				port: 7777,
				rewriteRules: [['/a', '/b']],
				verbose: true,
			});
		});
	});

	async function run(...args: string[]): Promise<void> {
		const moduleUrl = './index.js?t=' + Math.random().toString(16).slice(2);
		const module = await import(moduleUrl);
		const program = (module.program) as Command;
		await program.parseAsync(['./node', './index.ts', ...args]);
	}
});
