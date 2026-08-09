import { Container as VersatilesContainer } from '@versatiles/container';
import { guessStyle } from '@versatiles/style';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { ifNoneMatchMatches } from '../conditional.js';
import { log } from '../logger.js';
import type { Header as VersatilesHeader, Reader as VersatilesReader } from '@versatiles/container';
import type { Responder } from '../responder.js';

// Pass the file: URL straight to readFileSync rather than its .pathname, which
// is percent-encoded: a package installed under a path containing a space (or
// any character URL-encodes) would otherwise fail to read this file and, since
// this runs at module load, take down the process on startup.
const bufferPreview = readFileSync(new URL('../../../static/preview.html', import.meta.url));

/**
 * The preview page is a build-time constant, identical for every container, so
 * its validator is derived from the file itself rather than from any container.
 */
const previewEtag = `"${createHash('sha256').update(bufferPreview).digest('hex')}"`;

export class Versatiles {
	public readonly etag: string;

	readonly #container: VersatilesContainer;

	readonly #header: VersatilesHeader;

	readonly #metadata: string;

	private constructor(
		container: VersatilesContainer,
		header: VersatilesHeader,
		metadata: string,
		etag: string,
	) {
		this.#container = container;
		this.#header = header;
		this.#metadata = metadata;
		this.etag = etag;
	}

	public static async fromReader(reader: VersatilesReader, etag: string): Promise<Versatiles> {
		const container = new VersatilesContainer(reader);
		const header = await container.getHeader();
		const metadata = (await container.getMetadata()) ?? '';
		return new Versatiles(container, header, metadata, etag);
	}

	/**
	 * Serves a query against this container.
	 *
	 * @param url The public URL of this container, used to build the tile URLs in
	 * style.json. It is a parameter rather than instance state because instances
	 * are cached and shared: a server's own base URL must not be baked into an
	 * object that another server may later read.
	 */
	public async serve(query: string, url: string, responder: Responder): Promise<void> {
		// Log serving versatiles if verbose mode is enabled
		responder.log(`serve versatiles query: ${JSON.stringify(query)}`);

		// Handle different queries: preview, meta.json, style.json, or tile queries
		switch (query) {
			case '?preview':
				await this.sendPreview(responder);
				return;
			case '?tiles.json':
			case '?meta.json':
				await this.sendMeta(responder);
				return;
			case '?style.json':
				await this.sendStyle(url, responder);
				return;
		}

		// Extract tile coordinates from the query and serve the requested tile.
		//
		// Anchored at both ends, and each coordinate is written "0|[1-9]\d*"
		// rather than "\d+" so that exactly one spelling addresses a given tile.
		// With "\d+" the trailing anchor missing, "?8/58/70junk" worked; with
		// "\d+" alone, so did "?08/58/70" and "?0000008/58/70", since parseInt
		// discards leading zeros. Behind a CDN each spelling is its own cache key,
		// so an unbounded set of URLs mapped onto one response.
		const match = /^\?(?<z>0|[1-9]\d*)\/(?<x>0|[1-9]\d*)\/(?<y>0|[1-9]\d*)$/.exec(query);

		if (match != null) {
			const { z, x, y } = match.groups as { x: string; y: string; z: string };
			const coordinates = { x: parseInt(x, 10), y: parseInt(y, 10), z: parseInt(z, 10) };
			await this.sendTile(responder, coordinates);
			return;
		}

		responder.error(
			400,
			'get parameter must be "?preview", "?meta.json", "?tiles.json", "?style.json", or "?{z}/{x}/{y}"',
		);
		return;
	}

	/**
	 * Derives an entity-tag for something served from this container.
	 *
	 * Everything a container serves is fully determined by its revision plus what
	 * was asked for, so composing the two yields a validator without hashing any
	 * payload. Quotes are stripped from the parts because an entity-tag cannot
	 * contain them.
	 */
	#etagFor(...parts: (string | number)[]): string {
		const revision = this.etag.replace(/^W\//, '').replace(/^"(.*)"$/s, '$1');
		return `"${[revision, ...parts].join(':').replace(/"/g, '')}"`;
	}

	/**
	 * Records the validator for this response and answers 304 when the client
	 * already holds it.
	 *
	 * @returns true when the response has been sent and there is nothing to do.
	 */
	async #notModified(responder: Responder, etag: string): Promise<boolean> {
		responder.headers.set('etag', etag);

		const ifNoneMatch = responder.getRequestHeader('if-none-match');
		if (ifNoneMatch === undefined || !ifNoneMatchMatches(ifNoneMatch, etag)) return false;

		await responder.sendNotModified();
		return true;
	}

	private async sendPreview(responder: Responder): Promise<void> {
		if (await this.#notModified(responder, previewEtag)) return;
		await responder.respond(bufferPreview, 'text/html', 'raw');
	}

	private async sendMeta(responder: Responder): Promise<void> {
		if (await this.#notModified(responder, this.#etagFor('meta'))) return;
		await responder.respond(this.#metadata, 'application/json', 'raw');
	}

	private async sendStyle(url: string, responder: Responder): Promise<void> {
		responder.log('respond with style.json');

		// The generated style embeds the public URL, so it is part of the validator.
		if (await this.#notModified(responder, this.#etagFor('style', url))) return;

		try {
			const tileJson = JSON.parse(this.#metadata);
			tileJson.tiles = [`${url}?{z}/{x}/{y}`];
			const style = await guessStyle(tileJson, {});
			await responder.respond(JSON.stringify(style), 'application/json', 'raw');
		} catch (error) {
			// Log the details server-side but do not leak internal error messages
			// (which can echo malformed metadata) to the client.
			log('ERROR', 'style.json generation failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			responder.error(500, 'internal server error');
		}

		return;
	}

	private async sendTile(
		responder: Responder,
		coordinates: { x: number; y: number; z: number },
	): Promise<void> {
		const { x, y, z } = coordinates;

		// Checked before fetching: a tile is identified by the container revision
		// and its coordinates, both known already, so a client that still holds it
		// costs no bucket read at all.
		if (await this.#notModified(responder, this.#etagFor('tile', z, x, y))) return;

		responder.log(`fetch tile x:${x}, y:${y}, z:${z}`);

		const tile = await this.#container.getTile(z, x, y);

		// An absent tile is a normal, expected outcome for a sparse container, not
		// an error: answer 204 No Content. The explanation goes to the log, since
		// a 204 carries no body to put it in.
		//
		// It keeps the validator and cache-control set above, so a CDN can cache
		// and revalidate it like any tile — a sparse container has vastly more
		// absent tiles than present ones, and each uncacheable one is a permanent
		// origin hit. The empty body does not depend on accept-encoding, but the
		// resource is still negotiable, so caches must keep varying on it.
		if (tile == null) {
			responder.log(`no map tile at ${z}/${x}/${y}`);
			responder.headers.set('vary', 'accept-encoding');
			responder.sendEmpty(204);
		} else {
			responder.log(`return tile ${z}/${x}/${y}`);
			await responder.respond(tile, this.#header.tileMime, this.#header.tileCompression);
		}

		return;
	}
}
