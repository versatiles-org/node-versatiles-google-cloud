import { readFileSync } from 'fs';


export const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;
export const defaultHeader = {
	'cache-control': 'max-age=86400',
	server: 'versatiles-google-cloud v' + version,
	vary: 'accept-encoding',
};
