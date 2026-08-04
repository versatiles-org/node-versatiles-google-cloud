/** The outcome of the most recent dependency check. */
export interface ReadinessState {
	ready: boolean;
	/** Why the dependency was considered unavailable. Never sent to clients. */
	error?: string;
}

export interface ReadinessOptions {
	/** How long a successful check is trusted. */
	successTtlMs?: number;
	/** How long a failed check is trusted. Kept short so recovery is quick. */
	failureTtlMs?: number;
	/** Clock, injectable for tests. */
	now?: () => number;
}

/**
 * Caches the outcome of a dependency check.
 *
 * A readiness endpoint is polled continuously by load balancers, so probing the
 * bucket on every request would turn health checking into a steady stream of
 * API calls. Successes are therefore cached for a while; failures only briefly,
 * so an instance returns to service promptly once the bucket is reachable
 * again. Concurrent probes share a single in-flight check rather than each
 * starting their own.
 */
export class ReadinessCheck {
	readonly #probe: () => Promise<void>;

	readonly #successTtlMs: number;

	readonly #failureTtlMs: number;

	readonly #now: () => number;

	#cached?: ReadinessState;

	#expiresAt = 0;

	#inFlight?: Promise<ReadinessState>;

	public constructor(probe: () => Promise<void>, options: ReadinessOptions = {}) {
		this.#probe = probe;
		this.#successTtlMs = options.successTtlMs ?? 30_000;
		this.#failureTtlMs = options.failureTtlMs ?? 1_000;
		this.#now = options.now ?? Date.now;
	}

	/** The current state, running a fresh check only when the cache has expired. */
	public async get(): Promise<ReadinessState> {
		if (this.#cached !== undefined && this.#now() < this.#expiresAt) return this.#cached;

		this.#inFlight ??= this.#run();
		return this.#inFlight;
	}

	async #run(): Promise<ReadinessState> {
		let state: ReadinessState;

		try {
			await this.#probe();
			state = { ready: true };
		} catch (error) {
			state = { ready: false, error: error instanceof Error ? error.message : String(error) };
		}

		this.#cached = state;
		this.#expiresAt = this.#now() + (state.ready ? this.#successTtlMs : this.#failureTtlMs);
		this.#inFlight = undefined;

		return state;
	}
}
