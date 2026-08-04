import { describe, it, expect } from 'vitest';
import { Rewrite } from './rewrite.js';

/**
 * Semantic characterisation suite for rewrite rules.
 *
 * Rewrite patterns are *user-facing input*: they arrive via `--rewrite-rule` on
 * the CLI and via `rewriteRules` in the config file, and README.md documents
 * them against the path-to-regexp 6.x syntax. That makes the pattern language
 * part of this package's public contract, so it is pinned here as data rather
 * than as hard-coded strings scattered through assertions.
 *
 * Every entry carries a `migration` field recording whether the rule can be
 * expressed in path-to-regexp v8, which removed custom matching parameters
 * outright. Upgrading is therefore a breaking change to user configuration, not
 * a mechanical port — see the "v8 migration" block at the bottom for the guard
 * that keeps that cost visible.
 *
 * Expectations below were derived by executing the current implementation
 * (path-to-regexp 6.3.0), so this is a characterisation suite: it records what
 * the code *does*. Behaviour that looks unintended is marked with a NOTE rather
 * than silently blessed.
 */

type Feature = 'literal' | 'param' | 'optional' | 'repeat' | 'regex' | 'lookahead' | 'suffix';

type Migration =
	| { readonly v8: readonly [search: string, replacement: string] }
	| { readonly inexpressible: string };

interface RuleCase {
	/** Human-readable name, used as the describe() title. */
	readonly name: string;
	/** Which pattern-language feature this rule exercises. */
	readonly feature: Feature;
	/** The rule itself: [search, replacement]. */
	readonly rule: readonly [search: string, replacement: string];
	/** Whether this rule survives a path-to-regexp v8 upgrade. */
	readonly migration: Migration;
	/** [input path, expected rewrite or null when no rule matches]. */
	readonly cases: readonly (readonly [input: string, expected: string | null])[];
}

const CORPUS: readonly RuleCase[] = [
	{
		name: 'literal path',
		feature: 'literal',
		rule: ['/old', '/new'],
		migration: { v8: ['/old', '/new'] },
		cases: [
			['/old', '/new'],
			// NOTE: matching is case-insensitive and tolerates a trailing slash,
			// because path-to-regexp defaults to { sensitive: false, strict: false }.
			['/OLD', '/new'],
			['/old/', '/new'],
			['/olds', null],
			['/old/extra', null],
			['', null],
		],
	},
	{
		name: 'root path',
		feature: 'literal',
		rule: ['/', '/index'],
		migration: { v8: ['/', '/index'] },
		cases: [
			['/', '/index'],
			['', null],
			['/x', null],
		],
	},
	{
		name: 'single named parameter',
		feature: 'param',
		rule: ['/users/:id', '/api/users/:id'],
		migration: { v8: ['/users/:id', '/api/users/:id'] },
		cases: [
			['/users/123', '/api/users/123'],
			['/users/abc', '/api/users/abc'],
			['/users/a.b.c', '/api/users/a.b.c'],
			['/users/ü', '/api/users/ü'],
			['/users/:x', '/api/users/:x'],
			// A parameter matches exactly one segment.
			['/users/a/b', null],
			['/users/', null],
			['/users', null],
			// Percent-encoding is preserved verbatim; it is NOT decoded here.
			// server.ts decodes the path after rewriting, and the bucket layer
			// rejects traversal (see bucket_local.test.ts).
			['/users/my%20file', '/api/users/my%20file'],
			['/users/a%2Fb', '/api/users/a%2Fb'],
			// NOTE: dot segments pass through the rewrite untouched.
			['/users/..', '/api/users/..'],
			['/users/../../etc', null],
		],
	},
	{
		name: 'multiple named parameters',
		feature: 'param',
		rule: ['/users/:userId/posts/:postId', '/api/v2/users/:userId/posts/:postId'],
		migration: { v8: ['/users/:userId/posts/:postId', '/api/v2/users/:userId/posts/:postId'] },
		cases: [
			['/users/1/posts/42', '/api/v2/users/1/posts/42'],
			['/users/1/posts', null],
			['/users//posts/42', null],
		],
	},
	{
		name: 'parameter with literal suffix (documented in README)',
		feature: 'suffix',
		rule: ['/tiles/:source.versatiles', '/data/:source.versatiles'],
		migration: { v8: ['/tiles/:source.versatiles', '/data/:source.versatiles'] },
		cases: [
			['/tiles/osm.versatiles', '/data/osm.versatiles'],
			['/tiles/a.b.versatiles', '/data/a.b.versatiles'],
			['/tiles/osm', null],
			['/tiles/.versatiles', null],
		],
	},
	{
		name: 'optional parameter',
		feature: 'optional',
		rule: ['/api/:version?/users', '/users/:version?'],
		// v8 replaces the "?" modifier with an optional group.
		migration: { v8: ['/api{/:version}/users', '/users{/:version}'] },
		cases: [
			['/api/v1/users', '/users/v1'],
			['/api/users', '/users'],
			['/api//users', null],
			['/api/v1/v2/users', null],
		],
	},
	{
		name: 'repeating parameter',
		feature: 'repeat',
		rule: ['/files/:path+', '/static/:path+'],
		// v8 removed the "+" modifier; the nearest equivalent is a wildcard, but
		// it binds an array and matches zero-or-more segments, so "/files" would
		// start matching. Not a behaviour-preserving translation.
		migration: {
			inexpressible:
				'v8 removed the "+" modifier; "*path" matches zero segments and yields an array, so /files would newly match',
		},
		cases: [
			['/files/a', '/static/a'],
			['/files/a/b/c', '/static/a/b/c'],
			['/files/', null],
			['/files', null],
			['/files/a//b', null],
		],
	},
	{
		name: 'custom regex: numeric tile coordinates',
		feature: 'regex',
		rule: ['/t/osm/:z(\\d+)/:x(\\d+)/:y(\\d+)', '/d/osm.versatiles\\?:z/:x/:y'],
		migration: {
			inexpressible: 'v8 removed custom matching parameters; digit constraints must move into JS',
		},
		cases: [
			['/t/osm/5/17/11', '/d/osm.versatiles?5/17/11'],
			['/t/osm/0/0/0', '/d/osm.versatiles?0/0/0'],
			['/t/osm/14/8529/5975', '/d/osm.versatiles?14/8529/5975'],
			// NOTE: \d+ accepts leading zeros; the container is left to reject them.
			['/t/osm/007/1/1', '/d/osm.versatiles?007/1/1'],
			['/t/osm/a/b/c', null],
			['/t/osm/-1/0/0', null],
			['/t/osm/5/17', null],
			['/t/osm/5/17/11/x', null],
			['/t/osm', null],
		],
	},
	{
		name: 'custom regex: catch-all suffix',
		feature: 'regex',
		rule: ['/t/osm/:path(.+)', '/d/osm.versatiles\\?:path'],
		migration: {
			inexpressible: 'v8 removed custom matching parameters; "(.+)" has no equivalent spelling',
		},
		cases: [
			['/t/osm/5/17/11', '/d/osm.versatiles?5/17/11'],
			['/t/osm/meta.json', '/d/osm.versatiles?meta.json'],
			['/t/osm/a/b/c', '/d/osm.versatiles?a/b/c'],
			// Requires at least one character after the prefix.
			['/t/osm', null],
			['/t/osm/', null],
			// NOTE: "(.+)" is unanchored w.r.t. segments, so dot segments survive
			// the rewrite. Downstream decoding and bucket-level traversal checks
			// are what actually contain this.
			['/t/osm/../../etc', '/d/osm.versatiles?../../etc'],
			['/t/osm/a%2Fb', '/d/osm.versatiles?a%2Fb'],
		],
	},
	{
		name: 'custom regex with negative lookahead: extensionless paths',
		feature: 'lookahead',
		rule: ['/apps:any((?!.*\\.[^/]+$).*)?', '/apps:any((?!.*\\.[^/]+$).*)?/index.html'],
		migration: {
			inexpressible:
				'v8 removed custom matching parameters entirely; a negative lookahead cannot be expressed in any v8 pattern',
		},
		cases: [
			['/apps', '/apps/index.html'],
			['/apps/some', '/apps/some/index.html'],
			['/apps/a/b', '/apps/a/b/index.html'],
			[
				'/apps/deeply/nested/with/dots.dots.dots/within/a/dir',
				'/apps/deeply/nested/with/dots.dots.dots/within/a/dir/index.html',
			],
			// Anything ending in a file extension is left alone.
			['/apps/index.html', null],
			['/apps/a/b/c.js', null],
			// NOTE: the rule has no separator between the "/apps" literal and the
			// parameter, so it also captures sibling prefixes such as "/appsX".
			// Probably unintended — "/apps-admin" would be rewritten too.
			['/appsX', '/appsX/index.html'],
			// NOTE: a bare trailing slash produces a doubled slash in the output.
			['/apps/', '/apps//index.html'],
		],
	},
];

describe('rewrite semantics', () => {
	for (const { name, rule, cases } of CORPUS) {
		describe(name, () => {
			const [search, replacement] = rule;

			it(`compiles rule "${search}" -> "${replacement}"`, () => {
				expect(() => new Rewrite({ [search]: replacement })).not.toThrow();
			});

			// The cache must be a pure memoisation layer: enabling it may not
			// change any result. Both modes are asserted against the same table.
			for (const cache of [false, true]) {
				describe(`cache ${cache ? 'enabled' : 'disabled'}`, () => {
					for (const [input, expected] of cases) {
						it(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
							const rewrite = new Rewrite({ [search]: replacement }, { cache });
							expect(rewrite.match(input)).toBe(expected);
							// Repeat: a second call must agree with the first, whether it
							// was served from the cache or recomputed.
							expect(rewrite.match(input)).toBe(expected);
						});
					}
				});
			}
		});
	}
});

describe('rule ordering', () => {
	it('applies the first matching rule and ignores later ones', () => {
		const rewrite = new Rewrite({
			'/t/osm/:path(.+)': '/first/:path',
			'/t/:name/:path(.+)': '/second/:name/:path',
		});
		expect(rewrite.match('/t/osm/5/17/11')).toBe('/first/5/17/11');
		expect(rewrite.match('/t/other/5/17/11')).toBe('/second/other/5/17/11');
	});

	it('falls through to a later rule when the earlier one does not match', () => {
		const rewrite = new Rewrite({
			'/t/osm/:z(\\d+)': '/numeric/:z',
			'/t/osm/:name': '/named/:name',
		});
		expect(rewrite.match('/t/osm/42')).toBe('/numeric/42');
		expect(rewrite.match('/t/osm/meta')).toBe('/named/meta');
	});

	it('returns null when no rule matches', () => {
		const rewrite = new Rewrite({ '/a': '/b' });
		expect(rewrite.match('/nope')).toBeNull();
	});

	it('returns null when there are no rules at all', () => {
		expect(new Rewrite({}).match('/anything')).toBeNull();
	});
});

describe('invalid rules', () => {
	it('rejects a malformed search pattern and names both sides', () => {
		expect(() => new Rewrite({ '/old/::id': '/new' })).toThrow(
			/unable to add search \("\/old\/::id"\) \/ replacement \("\/new"\)/,
		);
	});

	it('preserves the underlying parser error as the cause', () => {
		let caught: unknown;
		try {
			new Rewrite({ '/old/::id': '/new' });
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(Error);
		expect((caught as Error).cause).toBeDefined();
	});
});

describe('v8 migration', () => {
	/**
	 * Guard, not documentation: if someone adds a rule shape that path-to-regexp
	 * v8 cannot express, this list must be updated deliberately. That keeps the
	 * cost of an eventual upgrade visible instead of letting it drift upward
	 * silently.
	 */
	const EXPECTED_BLOCKERS = [
		'custom regex with negative lookahead: extensionless paths',
		'custom regex: catch-all suffix',
		'custom regex: numeric tile coordinates',
		'repeating parameter',
	];

	it('every rule declares either a v8 translation or an explicit blocker', () => {
		for (const entry of CORPUS) {
			const hasTranslation = 'v8' in entry.migration;
			const hasBlocker = 'inexpressible' in entry.migration;
			expect(hasTranslation || hasBlocker, entry.name).toBe(true);
		}
	});

	it('has exactly the known set of v8 blockers', () => {
		const blockers = CORPUS.filter((entry) => 'inexpressible' in entry.migration)
			.map((entry) => entry.name)
			.sort();
		expect(blockers).toEqual(EXPECTED_BLOCKERS);
	});

	it('every declared v8 translation still compiles under the current version', () => {
		// The v6 and v8 spellings differ, so this only asserts that translations
		// recorded as "unchanged" are genuinely unchanged. Rules whose v8 spelling
		// differs are skipped until the upgrade actually happens.
		for (const entry of CORPUS) {
			if (!('v8' in entry.migration)) continue;
			const [v8Search, v8Replacement] = entry.migration.v8;
			if (v8Search !== entry.rule[0] || v8Replacement !== entry.rule[1]) continue;
			expect(() => new Rewrite({ [v8Search]: v8Replacement }), entry.name).not.toThrow();
		}
	});
});
