import type { Server } from 'http';
import { log as writeLog } from './logger.js';

/**
 * How long in-flight requests are given to finish before the process exits
 * anyway.
 *
 * Cloud Run sends SIGTERM and then SIGKILL about ten seconds later, so this
 * stays below that: better to close on our own terms, having logged why, than
 * to be killed mid-response.
 */
const DEFAULT_TIMEOUT_MS = 8000;

export interface ShutdownOptions {
	timeoutMs?: number;
	signals?: NodeJS.Signals[];
	log?: (message: string) => void;
	exit?: (code: number) => void;
}

/**
 * Stops the server cleanly when the platform asks the process to end.
 *
 * Without this, the default behaviour is to terminate immediately: every
 * in-flight response is cut off, which on Cloud Run means failed requests on
 * each deploy and each scale-down. Instead the listener is closed so no new
 * connections are accepted, and existing ones are given a moment to finish.
 *
 * Idle keep-alive sockets are closed explicitly, because `close()` waits for
 * every connection to end and an idle one never does on its own — the process
 * would otherwise sit until the timeout on every shutdown.
 *
 * @returns a function that removes the handlers again.
 */
export function installGracefulShutdown(server: Server, options: ShutdownOptions = {}): () => void {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const signals = options.signals ?? (['SIGTERM', 'SIGINT'] as NodeJS.Signals[]);
	const log = options.log ?? ((message: string): void => writeLog('INFO', message));
	const exit = options.exit ?? ((code: number): void => process.exit(code));

	let shuttingDown = false;

	const onSignal = (signal: NodeJS.Signals): void => {
		if (shuttingDown) {
			// A second signal means someone is in a hurry; stop waiting.
			log(`received ${signal} again, closing remaining connections`);
			server.closeAllConnections();
			exit(1);
			return;
		}

		shuttingDown = true;
		log(`received ${signal}, finishing in-flight requests`);

		const forceExit = setTimeout(() => {
			log(`still busy after ${timeoutMs}ms, closing remaining connections`);
			server.closeAllConnections();
			exit(1);
		}, timeoutMs);
		// Must not keep the process alive once the server has closed.
		forceExit.unref();

		server.close(() => {
			clearTimeout(forceExit);
			log('server closed');
			exit(0);
		});

		server.closeIdleConnections();
	};

	const handlers = signals.map((signal): [NodeJS.Signals, () => void] => {
		const handler = (): void => {
			onSignal(signal);
		};
		process.on(signal, handler);
		return [signal, handler];
	});

	return () => {
		for (const [signal, handler] of handlers) process.off(signal, handler);
	};
}
