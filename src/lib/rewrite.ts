import { compile, match } from "path-to-regexp";

/**
 * A compiled Rule containing search and replacement patterns to be
 * used to determine URL rewrites.
 */
type Rule = {
	search: {
		raw: string,
		resolve: ReturnType<typeof match>
	}
	replacement: {
		raw: string,
		compile: ReturnType<typeof compile>
	}
}

type Options = {
	verbose?: boolean;
	cache?: boolean;
}

const DEFAULT_OPTIONS: Options = {
	verbose: false,
	cache: true
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
	#rules: Rule[] = []

	/**
	 * Constructs a Rewrite manager.
	 *
	 * @param rules List of rules to be applied.
	 * @param options
	 */
	constructor(rules: [string, string][], private readonly options: Options = DEFAULT_OPTIONS) {
		for (const [_, [search, replacement]] of Object.entries(rules)) {
			this.register(search, replacement);
		}
	}

	register(search: string, replacement: string): Rewrite {
		try {
			const resolveSearch = match(search);
			const compileReplacement = compile(replacement);

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
			throw new Error(`unable to add search ("${search}") / replacement ("${replacement}") rule due to: ${error}`);
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
			this.#log(`cache hit for "${path}" => "${this.#cache.get(path)}"`);
			return cached;
		}

		for (const rule of this.#rules) {
			const matched = rule.search.resolve(path);
			if (!matched) {
				continue;
			}

			const target = rule.replacement.compile(matched.params);
			if (this.options.cache) {
				this.#cache.set(path, target);
			}

			this.#log(`rule "${rule.search.raw}" matched, rewriting "${path}" to "${target}"`);

			return target
		}

		return null;
	}

	#log(...args: unknown[]): void {
		if (!this.options.verbose) {
			return
		}

		console.log('[Rewrite]', ...args);
	}
}