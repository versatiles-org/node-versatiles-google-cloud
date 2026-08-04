import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Server } from 'http';
import { installGracefulShutdown } from './shutdown.js';

/** A stand-in for http.Server exposing only what the shutdown path touches. */
function fakeServer(): Server & {
	closeCallback?: () => void;
	closeIdleConnections: ReturnType<typeof vi.fn>;
	closeAllConnections: ReturnType<typeof vi.fn>;
} {
	const server = {
		closeCallback: undefined as (() => void) | undefined,
		close: vi.fn((cb?: () => void) => {
			server.closeCallback = cb;
			return server;
		}),
		closeIdleConnections: vi.fn(),
		closeAllConnections: vi.fn(),
	};
	return server as unknown as ReturnType<typeof fakeServer>;
}

const uninstallers: (() => void)[] = [];

/**
 * Behaviour is exercised through a signal the test runner does not itself use.
 * Attaching to the real SIGTERM/SIGINT for every case competes with vitest's own
 * handlers and trips Node's max-listeners warning; one test below still checks
 * that those two are the defaults.
 */
const TEST_SIGNAL = 'SIGUSR2' as NodeJS.Signals;

function install(server: Server, options: Parameters<typeof installGracefulShutdown>[1] = {}) {
	const uninstall = installGracefulShutdown(server, {
		log: () => undefined,
		signals: [TEST_SIGNAL],
		...options,
	});
	uninstallers.push(uninstall);
	return uninstall;
}

afterEach(() => {
	while (uninstallers.length > 0) uninstallers.pop()?.();
	vi.useRealTimers();
});

describe('installGracefulShutdown', () => {
	it('closes the server and exits 0 once in-flight requests finish', () => {
		const server = fakeServer();
		const exit = vi.fn();
		install(server, { exit });

		process.emit(TEST_SIGNAL);

		expect(server.close).toHaveBeenCalledTimes(1);
		expect(exit).not.toHaveBeenCalled();

		// The listener is closed, but the process waits for open connections.
		server.closeCallback?.();
		expect(exit).toHaveBeenCalledWith(0);
	});

	// close() waits for every connection to end, and an idle keep-alive socket
	// never does on its own — without this the process would sit until the
	// timeout on every single shutdown.
	it('closes idle keep-alive connections so close() can complete', () => {
		const server = fakeServer();
		install(server, { exit: vi.fn() });

		process.emit(TEST_SIGNAL);

		expect(server.closeIdleConnections).toHaveBeenCalledTimes(1);
		expect(server.closeAllConnections).not.toHaveBeenCalled();
	});

	it('gives up after the timeout and exits non-zero', () => {
		vi.useFakeTimers();
		const server = fakeServer();
		const exit = vi.fn();
		install(server, { exit, timeoutMs: 5000 });

		process.emit(TEST_SIGNAL);
		expect(exit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(5000);

		expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(1);
	});

	it('stops waiting when a second signal arrives', () => {
		const server = fakeServer();
		const exit = vi.fn();
		install(server, { exit });

		process.emit(TEST_SIGNAL);
		process.emit(TEST_SIGNAL);

		expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(1);
		// Still only one close(): the second signal short-circuits.
		expect(server.close).toHaveBeenCalledTimes(1);
	});

	// SIGTERM is what Cloud Run sends; SIGINT is Ctrl+C during local runs.
	it('listens for SIGTERM and SIGINT by default', () => {
		const before = {
			SIGTERM: process.listenerCount('SIGTERM'),
			SIGINT: process.listenerCount('SIGINT'),
		};

		const uninstall = installGracefulShutdown(fakeServer(), {
			log: () => undefined,
			exit: vi.fn(),
		});

		expect(process.listenerCount('SIGTERM')).toBe(before.SIGTERM + 1);
		expect(process.listenerCount('SIGINT')).toBe(before.SIGINT + 1);

		uninstall();

		// And removes exactly what it added.
		expect(process.listenerCount('SIGTERM')).toBe(before.SIGTERM);
		expect(process.listenerCount('SIGINT')).toBe(before.SIGINT);
	});

	it('removes its handlers when uninstalled', () => {
		const server = fakeServer();
		const uninstall = install(server, { exit: vi.fn() });

		uninstall();
		process.emit(TEST_SIGNAL);

		expect(server.close).not.toHaveBeenCalled();
	});
});
