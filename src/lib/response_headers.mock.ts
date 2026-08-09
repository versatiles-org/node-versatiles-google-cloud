export const defaultHeader = {
	'cache-control': 'max-age=86400',
	server: 'versatiles-google-cloud',
	vary: 'accept-encoding',
	'x-content-type-options': 'nosniff',
};

/**
 * The fixed header set `Responder.error()` writes. It does not build on
 * `defaultHeader`: an error response deliberately discards the headers
 * accumulated for the resource it failed to serve.
 */
export const errorHeader = {
	'cache-control': 'no-store',
	'content-type': 'text/plain',
	'x-content-type-options': 'nosniff',
};
