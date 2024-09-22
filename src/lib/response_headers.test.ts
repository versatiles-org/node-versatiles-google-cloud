 
import { ResponseHeaders } from './response_headers.js';
import { defaultHeader } from './response_headers.mock.test.js';

describe('ResponseHeaders', () => {
	let headers: ResponseHeaders;

	beforeEach(() => {
		headers = new ResponseHeaders();
	});

	test('should initialize with default cache-control header', () => {
		expect(headers.get('cache-control')).toBe('max-age=86400');
	});

	test('should initialize with default server header', () => {
		expect(headers.get('server')).toBe(defaultHeader.server);
	});

	test('should allow adding and retrieving custom headers', () => {
		headers.set('x-custom-header', 'value');
		expect(headers.get('x-custom-header')).toBe('value');
	});

	test('should override default headers if provided in constructor', () => {
		const customHeaders = new ResponseHeaders({ 'cache-control': 'max-age=0' });
		expect(customHeaders.get('cache-control')).toBe('max-age=0');
	});

	test('should remove headers', () => {
		headers.set('x-remove-me', 'gone');
		headers.remove('x-remove-me');
		expect(headers.get('x-remove-me')).toBeUndefined();
	});

	test('should lock headers and throw error on modification attempts', () => {
		headers.lock();
		expect(() => headers.set('x-new-header', 'value')).toThrow();
		expect(() => headers.remove('cache-control')).toThrow();
	});

	test('toString should return JSON string of headers', () => {
		headers.set('x-another-header', 'value');
		const expectedString = JSON.stringify({
			server: defaultHeader.server,
			'cache-control': defaultHeader['cache-control'],
			'x-another-header': 'value',
		});
		expect(headers.toString()).toBe(expectedString);
	});

	test('getHeaders should return the headers object', () => {
		const customHeaders = { 'x-my-header': 'myValue' };
		headers.set('x-my-header', customHeaders['x-my-header']);
		expect(headers.getHeaders()).toEqual(expect.objectContaining(customHeaders));
	});

	test('getContentEncoding should parse and return correct EncodingTools object', () => {
		headers.set('content-encoding', 'gzip');
		expect(headers.getContentEncoding().name).toEqual('gzip');
	});
});
