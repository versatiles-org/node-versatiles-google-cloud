import { JestConfigWithTsJest } from 'ts-jest';
import configOld from './jest.config.ts';

const config: JestConfigWithTsJest = {
	...configOld,
	transform: {},
	testMatch: [
		'**/temp/**/*.test.js',
		'!**/temp/**/*.mock.test.js',
	],
	extensionsToTreatAsEsm: [],
	moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
}

export default config;
