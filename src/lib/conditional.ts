/**
 * Whether an `If-None-Match` header matches the representation being served,
 * meaning the client already has it and only needs a `304`.
 *
 * Uses the weak comparison RFC 9110 §8.8.3.2 prescribes for this header: `W/`
 * prefixes are ignored on both sides, because the question is only whether the
 * client's copy is still good enough to reuse, not whether it is byte-identical.
 * (`If-Range` is the opposite case — see `ifRangeMatches`, which must compare
 * strongly because it splices bytes together.)
 *
 * `*` matches any existing representation.
 */
export function ifNoneMatchMatches(header: string, etag: string | undefined): boolean {
	if (etag === undefined) return false;

	const value = header.trim();
	if (value === '') return false;
	if (value === '*') return true;

	const opaque = (tag: string): string =>
		tag
			.trim()
			.replace(/^W\//, '')
			.replace(/^"(.*)"$/s, '$1');

	const current = opaque(etag);

	return value.split(',').some((candidate) => opaque(candidate) === current);
}
