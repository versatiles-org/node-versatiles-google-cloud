import { readFileSync } from 'node:fs';

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
export const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
export const defaultHeader = {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	'cache-control': 'max-age=86400',
	server: 'versatiles-google-cloud v' + version,
	vary: 'accept-encoding',
};
