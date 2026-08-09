import { it, describe, expect } from 'vitest';
import { readFileSync } from 'fs';
import { packageVersion } from './version.js';

describe('packageVersion', () => {
	it('reports the version declared in package.json', () => {
		const { version } = JSON.parse(
			readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
		) as { version: string };

		expect(packageVersion()).toBe(version);
	});

	it('returns the same value on repeated calls', () => {
		expect(packageVersion()).toBe(packageVersion());
	});
});
