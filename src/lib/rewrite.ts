import { compile, match } from 'path-to-regexp';
import { log } from './logger.js';

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
};

const DEFAULT_OPTIONS: Options = {
	verbose: false,
};

/**
 * Rewrite manager that applies URL rewrite rules based on provided patterns.
 *
 * Results are deliberately not memoised. Matching is a handful of compiled
 * regular expressions, run once per request and immediately followed by a
 * bucket round trip that costs orders of magnitude more — while the key would
 * have to be the whole URL, query string included, because rules match the
 * literal "?" of a container query. Under the tile-serving workload this
 * package exists for, every request is then a distinct key: a cache would evict
 * as fast as it filled, paying for its own bookkeeping and never returning a
 * hit.
 */
export class Rewrite {
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
		for (const rule of this.#rules) {
			const matched = rule.search.resolve(path);
			if (!matched) {
				continue;
			}

			const target = rule.replacement.compile(matched.params);

			this.#log(`rule "${rule.search.raw}" matched, rewriting "${path}" to "${target}"`);

			return target;
		}

		return null;
	}

	#log(...args: unknown[]): void {
		if (!this.options.verbose) {
			return;
		}

		log('DEBUG', ['[Rewrite]', ...args].map(String).join(' '));
	}
}
