import { readFileSync } from 'fs';

let cached: string | undefined;

/**
 * The version of this package, as declared in its package.json.
 *
 * Read from disk once and memoised: the readiness endpoint reports it on every
 * probe, and a load balancer polls that continuously.
 */
export function packageVersion(): string {
	// The URL is passed to readFileSync as-is rather than via .pathname, which
	// is percent-encoded and would not resolve an install directory containing
	// a space.
	cached ??= (
		JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
			version: string;
		}
	).version;

	return cached;
}
