import { Container as VersatilesContainer } from '@versatiles/container';
import { guessStyleFromContainer } from '@versatiles/style';
import { readFileSync } from 'fs';
import type { GuessContainerOptions } from '@versatiles/style';
import type { Header as VersatilesHeader, Reader as VersatilesReader } from '@versatiles/container';
import type { Responder } from '../responder.js';

const filenamePreview = new URL('../../../static/preview.html', import.meta.url).pathname;
const bufferPreview = readFileSync(filenamePreview);

export class Versatiles {
	readonly #container: VersatilesContainer;

	readonly #header: VersatilesHeader;

	readonly #metadata: unknown;

	readonly #url: string;

	// eslint-disable-next-line @typescript-eslint/max-params
	private constructor(container: VersatilesContainer, header: VersatilesHeader, metadata: unknown, url: string) {
		this.#container = container;
		this.#header = header;
		this.#metadata = metadata;
		this.#url = url;
	}

	public static async fromReader(reader: VersatilesReader, url: string): Promise<Versatiles> {
		const container = new VersatilesContainer(reader);
		const header = await container.getHeader();
		let metadata: unknown;
		try {
			metadata = JSON.parse(await container.getMetadata() ?? '');
		} catch (e) { }

		return new Versatiles(container, header, metadata, url);
	}

	public async serve(query: string, responder: Responder): Promise<void> {
		// Log serving versatiles if verbose mode is enabled
		responder.log(`serve versatiles query: ${JSON.stringify(query)}`);

		// Handle different queries: preview, meta.json, style.json, or tile queries
		switch (query) {
			case 'preview': await this.sendPreview(responder); return;
			case 'meta.json': await this.sendMeta(responder); return;
			case 'style.json': await this.sendStyle(responder); return;
		}

		// Extract tile coordinates from the query and serve the requested tile
		const match = /tiles\/(?<z>\d+)\/(?<x>\d+)\/(?<y>\d+)/.exec(query);

		if (match != null) {
			const { z, x, y } = match.groups as { x: string; y: string; z: string };
			const coordinates = { x: parseInt(x, 10), y: parseInt(y, 10), z: parseInt(z, 10) };
			await this.sendTile(responder, coordinates);
			return;
		}

		responder.error(400, 'get parameter must be "?preview", "?meta.json", "?style.json", or "?tile/{z}/{x}/{y}"');
		return;
	}

	private async sendPreview(responder: Responder): Promise<void> {
		await responder.respond(bufferPreview, 'text/html', 'raw');
	}

	private async sendMeta(responder: Responder): Promise<void> {
		await responder.respond(JSON.stringify(this.#metadata), 'application/json', 'raw');
	}

	private async sendStyle(responder: Responder): Promise<void> {

		responder.log('respond with style.json');

		const options: GuessContainerOptions = {
			tiles: [`${this.#url}?tiles/{z}/{x}/{y}`],
		};
		try {
			const style = await guessStyleFromContainer(this.#container, options);
			await responder.respond(JSON.stringify(style), 'application/json', 'raw');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			responder.error(500, `server side error: ${message}`);
		}

		return;
	}

	private async sendTile(responder: Responder, coordinates: { x: number; y: number; z: number }): Promise<void> {
		const { x, y, z } = coordinates;

		responder.log(`fetch tile x:${x}, y:${y}, z:${z}`);

		const tile = await this.#container.getTile(z, x, y);

		// Return error for invalid queries
		if (tile == null) {
			responder.error(204, `no map tile at ${z}/${x}/${y}`);
		} else {
			responder.log(`return tile ${z}/${x}/${y}`);
			await responder.respond(tile, this.#header.tileMime, this.#header.tileCompression);
		}

		return;
	}
}
