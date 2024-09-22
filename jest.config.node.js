import configOld from './jest.config.js';

export default {
	...configOld,
	transform: {},
	testMatch: [
		'**/temp/**/*.test.js',
		'!**/temp/**/*.mock.test.js',
	],
	extensionsToTreatAsEsm: [],
	moduleNameMapper: { '^(\\.{1,2}/.*)\\.js$': '$1' },
}
