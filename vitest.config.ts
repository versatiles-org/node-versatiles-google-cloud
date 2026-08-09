import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',

			// Stated as globs rather than left to default. Two things follow from
			// that: files no test ever imports are counted as the untested code they
			// are, instead of being absent from the report; and test scaffolding is
			// excluded, so the figure describes the code that ships rather than the
			// code that checks it.
			include: ['src/**/*.ts'],
			exclude: ['**/*.test.ts', '**/*.mock.ts'],
		},
	},
});
