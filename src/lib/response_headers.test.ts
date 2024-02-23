import { ResponseHeaders } from './response_headers';


describe('ResponseHeaders', () => {
	it('should set and get response headers correctly', () => {
		const headers = new ResponseHeaders();

		headers.set('test-header', 'test-value');
		expect(headers.get('test-header')).toBe('test-value');

		headers.remove('test-header');
		expect(headers.get('test-header')).toBeUndefined();
	});
});

