import type { Command } from 'commander';
import type { startServer } from './lib/server.js';
import { vi, it, describe, beforeEach, expect } from 'vitest';

const mockedStartServer = vi.fn<typeof startServer>().mockResolvedValue(null);
vi.mock('./lib/server.js', () => ({ startServer: mockedStartServer }));

vi.spyOn(process, 'exit').mockImplementation(vi.fn<typeof process.exit>());

vi.spyOn(console, 'log').mockReturnValue();
vi.spyOn(console, 'table').mockReturnValue();

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
	});

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

	async function run(...args: string[]): Promise<void> {
		const moduleUrl = './index.js?t=' + Math.random().toString(16).slice(2);
		const module = await import(moduleUrl);
		const program = (module.program) as Command;
		program.parse(['./node', './index.ts', ...args]);
	}
});
