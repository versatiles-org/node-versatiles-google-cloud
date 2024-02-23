import type { Header as VersatilesHeader, Reader } from '@versatiles/container';
import type { MaplibreStyle } from '@versatiles/style/dist/lib/types';
import type { AbstractBucketFile } from './bucket';
import type { Responder } from './responder';
import { Container as VersatilesContainer } from '@versatiles/container';
import { guessStyle } from '@versatiles/style';
import { readFile } from 'node:fs/promises';

// Path to the preview HTML file
const filenamePreview = new URL('../../static/preview.html', import.meta.url).pathname;

// Cache for Versatiles containers
const containerCache = new Map<string, {
	container: VersatilesContainer;
	header: VersatilesHeader;
	metadata: unknown;
}>();

/**
 * Serves content from a Versatiles container.
 * @param file - The Versatiles container file.
 * @param path - The path to the file.
 * @param query - The query string from the request.
 * @param responder - The ResponderInterface instance to handle responses.
 */
// eslint-disable-next-line @typescript-eslint/max-params
export async function serveVersatiles(file: AbstractBucketFile, path: string, query: string, responder: Responder): Promise<void> {
	// Log serving versatiles if verbose mode is enabled
	responder.log('serve versatiles');

	let container: VersatilesContainer;
	let header: VersatilesHeader;
	let metadata: unknown = null;

	// Check if container is cached and use it, otherwise read from file
	const cache = containerCache.get(file.name);
	if (cache == null) {
		// Define a reader function for the Versatiles container
		const reader: Reader = async (position: number, length: number): Promise<Buffer> => {
			// Read data from the file stream
			return new Promise<Buffer>((resolve, reject) => {
				const buffers = Array<Buffer>();
				file.createReadStream({ start: position, end: position + length - 1 })
					.on('data', (chunk: Buffer) => buffers.push(chunk))
					.on('end', () => {
						resolve(Buffer.concat(buffers));
					})
					.on('error', err => {
						reject(`error accessing bucket stream - ${String(err)}`);
					});
			});
		};

		// Initialize Versatiles container and read its header and metadata
		container = new VersatilesContainer(reader);
		header = await container.getHeader();

		try {
			metadata = JSON.parse(await container.getMetadata() ?? '');
		} catch (e) { }

		responder.log(`header: ${JSON.stringify(header)}`);
		responder.log(`metadata: ${JSON.stringify(metadata).slice(0, 80)}`);

		// Cache the container for future use
		containerCache.set(file.name, { container, header, metadata });
	} else {
		({ container, header, metadata } = cache);
	}

	// Log the query if verbose mode is enabled
	responder.log(`query: ${JSON.stringify(query)}`);

	// Handle different queries: preview, meta.json, style.json, or tile queries
	switch (query) {
		case 'preview':
			responder.log('respond preview');
			await responder.respond(await readFile(filenamePreview), 'text/html', 'raw');
			return;
		case 'meta.json':
			responder.log('respond with meta.json');
			await responder.respond(JSON.stringify(metadata), 'application/json', 'raw');
			return;
		case 'style.json':
			responder.log('respond with style.json');

			let style: MaplibreStyle;
			const format = header.tileFormat;
			const options = {
				tiles: [`${path}?tiles/{z}/{x}/{y}`],
				format,
				bounds: header.bbox,
				minzoom: header.zoomMin,
				maxzoom: header.zoomMax,
			};
			switch (format) {
				case 'jpeg': style = guessStyle({ ...options, format: 'jpg' }); break;
				case 'webp':
				case 'png':
				case 'avif':
					style = guessStyle({ ...options, format });
					break;
				case 'pbf':
					if (metadata == null) {
						responder.error(500, 'metadata must be defined');
						return;
					}
					if (typeof metadata !== 'object') {
						responder.error(500, 'metadata must be an object');
						return;
					}
					if (!('vector_layers' in metadata)) {
						responder.error(500, 'metadata must contain property vector_layers');
						return;
					}
					const vectorLayers = metadata.vector_layers;
					if (!Array.isArray(vectorLayers)) {
						responder.error(500, 'metadata.vector_layers must be an array');
						return;
					}
					try {
						style = guessStyle({ ...options, format, vectorLayers });
					} catch (e) {
						responder.error(500, 'style can not be guessed based on metadata');
						return;
					}
					break;
				case 'bin':
				case 'geojson':
				case 'json':
				case 'svg':
				case 'topojson':
					responder.error(500, `tile format "${format}" is not supported`);
					return;
			}
			await responder.respond(JSON.stringify(style), 'application/json', 'raw');
			return;
	}

	// Extract tile coordinates from the query and serve the requested tile
	const match = /tiles\/(?<z>\d+)\/(?<x>\d+)\/(?<y>\d+)/.exec(query);
	if (match == null) {
		responder.error(400, 'get parameter must be "meta.json", "style.json", or "tile/{z}/{x}/{y}"');
		return;
	}

	const { z, x, y } = match.groups as { x: string; y: string; z: string };
	responder.log(`fetch tile x:${x}, y:${y}, z:${z}`);

	const tile = await container.getTile(
		parseInt(z, 10),
		parseInt(x, 10),
		parseInt(y, 10),
	);

	// Return error for invalid queries
	if (tile == null) {
		responder.error(204, `no map tile at ${z}/${x}/${y}`);
	} else {
		responder.log(`return tile ${z}/${x}/${y}`);
		await responder.respond(tile, header.tileMime, header.tileCompression);
	}

	return;
}
