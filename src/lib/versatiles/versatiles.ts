import { Container as VersatilesContainer } from '@versatiles/container';
import { guessStyle } from '@versatiles/style';
import { readFileSync } from 'fs';
import type { Header as VersatilesHeader, Reader as VersatilesReader } from '@versatiles/container';
import type { Responder } from '../responder.js';

// Pass the file: URL straight to readFileSync rather than its .pathname, which
// is percent-encoded: a package installed under a path containing a space (or
// any character URL-encodes) would otherwise fail to read this file and, since
// this runs at module load, take down the process on startup.
const bufferPreview = readFileSync(new URL('../../../static/preview.html', import.meta.url));

export class Versatiles {
	public readonly etag: string;

	readonly #container: VersatilesContainer;

	readonly #header: VersatilesHeader;

	readonly #metadata: string;

	readonly #url: string;

	private constructor(
		container: VersatilesContainer,
		header: VersatilesHeader,
		metadata: string,
		url: string,
		etag: string,
	) {
		this.#container = container;
		this.#header = header;
		this.#metadata = metadata;
		this.#url = url;
		this.etag = etag;
	}

	public static async fromReader(
		reader: VersatilesReader,
		url: string,
		etag: string,
	): Promise<Versatiles> {
		const container = new VersatilesContainer(reader);
		const header = await container.getHeader();
		const metadata = (await container.getMetadata()) ?? '';
		return new Versatiles(container, header, metadata, url, etag);
	}

	public async serve(query: string, responder: Responder): Promise<void> {
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
				await this.sendStyle(responder);
				return;
		}

		// Extract tile coordinates from the query and serve the requested tile.
		// Anchored at both ends: without the trailing "$", anything after the
		// coordinates was ignored, so "?8/58/70", "?8/58/70junk" and "?8/58/70/99"
		// all returned the same tile. Behind a CDN each of those is a separate
		// cache key, so an unbounded set of URLs mapped onto one response.
		const match = /^\?(?<z>\d+)\/(?<x>\d+)\/(?<y>\d+)$/.exec(query);

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

	private async sendPreview(responder: Responder): Promise<void> {
		await responder.respond(bufferPreview, 'text/html', 'raw');
	}

	private async sendMeta(responder: Responder): Promise<void> {
		await responder.respond(this.#metadata, 'application/json', 'raw');
	}

	private async sendStyle(responder: Responder): Promise<void> {
		responder.log('respond with style.json');

		try {
			const tileJson = JSON.parse(this.#metadata);
			tileJson.tiles = [`${this.#url}?{z}/{x}/{y}`];
			const style = await guessStyle(tileJson, {});
			await responder.respond(JSON.stringify(style), 'application/json', 'raw');
		} catch (error) {
			// Log the details server-side but do not leak internal error messages
			// (which can echo malformed metadata) to the client.
			console.error('style.json generation failed:', error);
			responder.error(500, 'internal server error');
		}

		return;
	}

	private async sendTile(
		responder: Responder,
		coordinates: { x: number; y: number; z: number },
	): Promise<void> {
		const { x, y, z } = coordinates;

		responder.log(`fetch tile x:${x}, y:${y}, z:${z}`);

		const tile = await this.#container.getTile(z, x, y);

		// An absent tile is a normal, expected outcome for a sparse container, not
		// an error: answer 204 No Content. The explanation goes to the log, since
		// a 204 carries no body to put it in.
		if (tile == null) {
			responder.log(`no map tile at ${z}/${x}/${y}`);
			responder.sendEmpty(204);
		} else {
			responder.log(`return tile ${z}/${x}/${y}`);
			await responder.respond(tile, this.#header.tileMime, this.#header.tileCompression);
		}

		return;
	}
}
