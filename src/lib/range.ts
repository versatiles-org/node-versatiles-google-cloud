/**
 * Whether an `If-Range` value still matches the representation being served.
 *
 * Per RFC 9110 §13.1.5 a range must only be honoured while the client's copy of
 * the validator is current; otherwise the range is ignored and the whole
 * representation is sent. Without this, a client resuming an interrupted
 * download of a file that changed in the meantime would splice together bytes
 * from two different versions and never notice.
 *
 * Only strong entity-tags can satisfy it. A weak tag is rejected because it
 * does not guarantee byte-for-byte equality, and the HTTP-date form is rejected
 * because no `Last-Modified` header is sent to compare against — in both cases
 * the safe answer is "does not match", which costs a full body rather than
 * risking a corrupted one.
 */
export function ifRangeMatches(ifRange: string, etag: string | undefined): boolean {
	if (etag === undefined) return false;

	const value = ifRange.trim();
	if (value === '' || value.startsWith('W/')) return false;

	const unquote = (text: string): string => text.replace(/^"(.*)"$/s, '$1');

	// Tolerate either spelling: this server emits an unquoted entity-tag, while
	// a client or proxy may echo it back quoted.
	return unquote(value) === unquote(etag.trim());
}

/** A resolved, inclusive byte range within a representation. */
export interface ByteRange {
	start: number;
	end: number;
}

/**
 * Parses a single byte range from a `Range` header, per RFC 9110 §14.1.
 *
 * Returns:
 * - a {@link ByteRange} when exactly one satisfiable range was requested;
 * - `'unsatisfiable'` when the range names no bytes of the representation,
 *   which the caller must answer with `416` and `Content-Range: bytes *\/size`;
 * - `null` when the header is absent, malformed, uses a unit other than bytes,
 *   or asks for several ranges. A server is always permitted to ignore a Range
 *   header and send the full representation, which is what the caller does —
 *   answering multiple ranges would require a `multipart/byteranges` body.
 */
export function parseByteRange(
	header: string | undefined,
	size: number,
): ByteRange | 'unsatisfiable' | null {
	if (header === undefined) return null;
	if (!Number.isInteger(size) || size < 0) return null;

	const unit = /^bytes=(.*)$/i.exec(header.trim());
	if (unit === null) return null;

	const specs = unit[1].split(',');
	if (specs.length !== 1) return null;

	const spec = /^\s*(\d*)\s*-\s*(\d*)\s*$/.exec(specs[0]);
	if (spec === null) return null;

	const [, firstText, lastText] = spec;
	// "-" on its own names neither a start nor a suffix length.
	if (firstText === '' && lastText === '') return null;

	if (firstText === '') {
		// Suffix form: the final N bytes. "bytes=-0" names nothing.
		const suffixLength = Number(lastText);
		if (suffixLength === 0 || size === 0) return 'unsatisfiable';
		return { start: Math.max(0, size - suffixLength), end: size - 1 };
	}

	const start = Number(firstText);
	if (start >= size) return 'unsatisfiable';

	const end = lastText === '' ? size - 1 : Math.min(Number(lastText), size - 1);
	// A last-byte-pos below first-byte-pos is malformed rather than unsatisfiable.
	if (end < start) return null;

	return { start, end };
}
