import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLogFormat, log, setLogFormat, traceFieldFrom } from './logger.js';

let out: ReturnType<typeof vi.spyOn>;
let err: ReturnType<typeof vi.spyOn>;
const env = { ...process.env };

beforeEach(() => {
	out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
	err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	out.mockRestore();
	err.mockRestore();
	process.env = { ...env };
	setLogFormat('text');
});

const lastJson = (spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> =>
	JSON.parse(String(spy.mock.calls.at(-1)?.[0])) as Record<string, unknown>;

describe('log format detection', () => {
	it('uses text outside Cloud Run', () => {
		delete process.env.K_SERVICE;
		delete process.env.LOG_FORMAT;
		expect(setLogFormat()).toBe('text');
	});

	// Cloud Run sets K_SERVICE, and parses JSON lines into severity and trace.
	it('uses json when running on Cloud Run', () => {
		process.env.K_SERVICE = 'tiles';
		delete process.env.LOG_FORMAT;
		expect(setLogFormat()).toBe('json');
	});

	it('lets LOG_FORMAT override the detection either way', () => {
		process.env.K_SERVICE = 'tiles';
		process.env.LOG_FORMAT = 'text';
		expect(setLogFormat()).toBe('text');

		delete process.env.K_SERVICE;
		process.env.LOG_FORMAT = 'JSON';
		expect(setLogFormat()).toBe('json');
	});

	it('ignores an unrecognised LOG_FORMAT', () => {
		delete process.env.K_SERVICE;
		process.env.LOG_FORMAT = 'yaml';
		expect(setLogFormat()).toBe('text');
	});
});

describe('log', () => {
	it('writes plain messages in text mode', () => {
		setLogFormat('text');
		log('INFO', 'listening on port 8080', { port: 8080 });

		expect(out).toHaveBeenCalledWith('listening on port 8080');
		expect(getLogFormat()).toBe('text');
	});

	it('writes one JSON object per line in json mode', () => {
		setLogFormat('json');
		log('INFO', 'listening on port 8080', { port: 8080 });

		expect(lastJson(out)).toStrictEqual({
			severity: 'INFO',
			message: 'listening on port 8080',
			port: 8080,
		});
	});

	// Severity must survive even where the line is not parsed as JSON, and the
	// stream is what carries it then.
	it('sends warnings and errors to stderr, everything else to stdout', () => {
		setLogFormat('json');

		log('DEBUG', 'a');
		log('INFO', 'b');
		expect(out).toHaveBeenCalledTimes(2);
		expect(err).not.toHaveBeenCalled();

		log('WARNING', 'c');
		log('ERROR', 'd');
		expect(err).toHaveBeenCalledTimes(2);
	});

	it('renames trace to the field Cloud Logging groups on', () => {
		setLogFormat('json');
		log('ERROR', 'boom', { trace: 'projects/p/traces/abc' });

		const entry = lastJson(err);
		expect(entry['logging.googleapis.com/trace']).toBe('projects/p/traces/abc');
		expect(entry.trace).toBeUndefined();
	});

	it('omits an absent trace entirely', () => {
		setLogFormat('json');
		log('INFO', 'no trace here');

		expect(lastJson(out)).toStrictEqual({ severity: 'INFO', message: 'no trace here' });
	});
});

describe('traceFieldFrom', () => {
	it('returns undefined without a header', () => {
		expect(traceFieldFrom(undefined)).toBeUndefined();
		expect(traceFieldFrom('')).toBeUndefined();
	});

	// The header is "TRACE_ID/SPAN_ID;o=1"; only the trace id is wanted.
	it('takes the trace id from the header', () => {
		delete process.env.GOOGLE_CLOUD_PROJECT;
		delete process.env.GCLOUD_PROJECT;
		expect(traceFieldFrom('abc123/456;o=1')).toBe('abc123');
	});

	// Correlation only works when the field names the project.
	it('qualifies the id with the project when one is known', () => {
		process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
		expect(traceFieldFrom('abc123/456;o=1')).toBe('projects/my-project/traces/abc123');
	});
});
