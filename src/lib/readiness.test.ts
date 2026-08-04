import { describe, it, expect, vi } from 'vitest';
import { ReadinessCheck } from './readiness.js';

/** A controllable clock, so the cache can be tested without real waiting. */
function clock(): { now: () => number; advance: (ms: number) => void } {
	let t = 1_000_000;
	return { now: () => t, advance: (ms) => (t += ms) };
}

describe('ReadinessCheck', () => {
	it('reports ready when the probe resolves', async () => {
		const check = new ReadinessCheck(async () => Promise.resolve());
		expect(await check.get()).toStrictEqual({ ready: true });
	});

	it('reports not ready and keeps the reason when the probe rejects', async () => {
		const check = new ReadinessCheck(async () => Promise.reject(new Error('no credentials')));

		const state = await check.get();

		expect(state.ready).toBe(false);
		expect(state.error).toBe('no credentials');
	});

	it('stringifies a non-Error rejection', async () => {
		const check = new ReadinessCheck(async () => Promise.reject('plain string'));
		expect((await check.get()).error).toBe('plain string');
	});

	// A load balancer polls continuously; each poll must not become a bucket call.
	it('caches a success for the success TTL', async () => {
		const { now, advance } = clock();
		const probe = vi.fn(async () => Promise.resolve());
		const check = new ReadinessCheck(probe, { successTtlMs: 30_000, now });

		await check.get();
		advance(29_999);
		await check.get();
		expect(probe).toHaveBeenCalledTimes(1);

		advance(2);
		await check.get();
		expect(probe).toHaveBeenCalledTimes(2);
	});

	// Failures expire quickly so an instance returns to service promptly once the
	// bucket is reachable again, rather than staying out for a whole success TTL.
	it('caches a failure only for the shorter failure TTL', async () => {
		const { now, advance } = clock();
		const probe = vi.fn(async () => Promise.reject(new Error('down')));
		const check = new ReadinessCheck(probe, { successTtlMs: 30_000, failureTtlMs: 1_000, now });

		await check.get();
		advance(999);
		await check.get();
		expect(probe).toHaveBeenCalledTimes(1);

		advance(2);
		await check.get();
		expect(probe).toHaveBeenCalledTimes(2);
	});

	it('recovers as soon as the probe succeeds again', async () => {
		const { now, advance } = clock();
		let healthy = false;
		const check = new ReadinessCheck(
			async () => (healthy ? Promise.resolve() : Promise.reject(new Error('down'))),
			{ failureTtlMs: 1_000, now },
		);

		expect((await check.get()).ready).toBe(false);

		healthy = true;
		advance(1_001);

		expect((await check.get()).ready).toBe(true);
	});

	// Many probes arriving together must not each start their own bucket call.
	it('collapses concurrent probes into one check', async () => {
		let release = (): void => {};
		const probe = vi.fn(
			async () =>
				new Promise<void>((resolve) => {
					release = resolve;
				}),
		);
		const check = new ReadinessCheck(probe);

		const results = Promise.all([check.get(), check.get(), check.get()]);
		release();

		expect(await results).toStrictEqual([{ ready: true }, { ready: true }, { ready: true }]);
		expect(probe).toHaveBeenCalledTimes(1);
	});

	it('runs a fresh check after an in-flight one settles', async () => {
		const { now, advance } = clock();
		const probe = vi.fn(async () => Promise.resolve());
		const check = new ReadinessCheck(probe, { successTtlMs: 10, now });

		await check.get();
		advance(11);
		await check.get();

		expect(probe).toHaveBeenCalledTimes(2);
	});
});
