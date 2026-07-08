import { compile, match } from 'path-to-regexp';

/**
 * A compiled Rule containing search and replacement patterns to be
 * used to determine URL rewrites.
 */
type Rule = {
	search: {
		raw: string;
		resolve: ReturnType<typeof match>;
	};
	replacement: {
		raw: string;
		compile: ReturnType<typeof compile>;
	};
};

type Options = {
	verbose?: boolean;
	cache?: boolean;
	cacheLimit?: number;
};

/**
 * Upper bound for the number of entries kept in the rewrite cache. Request
 * paths are attacker-controlled, so an unbounded cache would grow without
 * limit under a wildcard rule and exhaust memory. Least-recently-used entries
 * are evicted once this limit is exceeded.
 */
const DEFAULT_CACHE_LIMIT = 1000;

const DEFAULT_OPTIONS: Options = {
	verbose: false,
	cache: true,
	cacheLimit: DEFAULT_CACHE_LIMIT,
};

/**
 * Rewrite manager that applies URL rewrite rules based on provided patterns.
 */
export class Rewrite {
	/**
	 * Cache for storing previously rewritten URLs.
	 */
	#cache = new Map<string, string>();

	/**
	 * Compiled rewrite rules.
	 */
	#rules: Rule[] = [];

	/**
	 * Constructs a Rewrite manager.
	 *
	 * @param rules List of rules to be applied.
	 * @param options
	 */
	constructor(
		rules: Record<string, string>,
		private readonly options: Options = DEFAULT_OPTIONS,
	) {
		for (const [search, replacement] of Object.entries(rules)) {
			this.register(search, replacement);
		}
	}

	register(search: string, replacement: string): Rewrite {
		try {
			const resolveSearch = match(search);
			const compileReplacement = compile(replacement, { validate: false });

			this.#rules.push({
				search: {
					raw: search,
					resolve: resolveSearch,
				},
				replacement: {
					raw: replacement,
					compile: compileReplacement,
				},
			});

			return this;
		} catch (error) {
			throw new Error(
				`unable to add search ("${search}") / replacement ("${replacement}") rule due to: ${error}`,
				{ cause: error },
			);
		}
	}

	/**
	 * Matches and rewrites a given path based on the defined rules.
	 *
	 * @param path The path to be rewritten.
	 * @returns The rewritten path or null if no rules matched.
	 */
	match(path: string): string | null {
		if (this.options.cache && this.#cache.has(path)) {
			const cached = this.#cache.get(path)!;
			// Mark as most-recently-used by re-inserting at the end of the Map.
			this.#cache.delete(path);
			this.#cache.set(path, cached);
			this.#log(`cache hit for "${path}" => "${cached}"`);
			return cached;
		}

		for (const rule of this.#rules) {
			const matched = rule.search.resolve(path);
			if (!matched) {
				continue;
			}

			const target = rule.replacement.compile(matched.params);
			if (this.options.cache) {
				this.#cacheSet(path, target);
			}

			this.#log(`rule "${rule.search.raw}" matched, rewriting "${path}" to "${target}"`);

			return target;
		}

		return null;
	}

	/**
	 * Current number of cached entries. Exposed for monitoring and testing.
	 */
	public get cacheSize(): number {
		return this.#cache.size;
	}

	/**
	 * Whether a path is currently cached. Exposed for monitoring and testing.
	 */
	public cacheHas(path: string): boolean {
		return this.#cache.has(path);
	}

	/**
	 * Stores a cache entry, evicting the least-recently-used entry once the
	 * configured cache limit is exceeded.
	 */
	#cacheSet(path: string, target: string): void {
		this.#cache.set(path, target);

		const limit = this.options.cacheLimit ?? DEFAULT_CACHE_LIMIT;
		while (this.#cache.size > limit) {
			const oldest = this.#cache.keys().next().value;
			if (oldest === undefined) break;
			this.#cache.delete(oldest);
		}
	}

	#log(...args: unknown[]): void {
		if (!this.options.verbose) {
			return;
		}

		console.log('[Rewrite]', ...args);
	}
}
