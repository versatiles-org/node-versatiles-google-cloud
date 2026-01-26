import { describe, it, expect } from 'vitest';
import { Rewrite } from './rewrite.js';

describe('Rewrite', () => {
	describe('constructor', () => {
		it('should create an instance with empty rules', () => {
			const rewrite = new Rewrite([]);
			expect(rewrite).toBeInstanceOf(Rewrite);
		});

		it('should create an instance with rules', () => {
			const rewrite = new Rewrite([
				['/old/:id', '/new/:id'],
				['/legacy{/*path}', '/modern{/*path}'],
			]);
			expect(rewrite).toBeInstanceOf(Rewrite);
		});

		it('should throw an error if a rule is invalid', () => {
			expect(() => {
				// @ts-expect-error Testing invalid input
				new Rewrite([['/old/:id']]);
			}).toThrow();
			expect(() => {
				new Rewrite([['/old/::id', '/new']])
			}).toThrow();
		})
	});

	describe('match', () => {
		it('should return null when no rules match', () => {
			const rewrite = new Rewrite([
				['/old/:id', '/new/:id'],
			]);
			expect(rewrite.match('/other/path')).toBeNull();
		});

		it('should return null with empty rules', () => {
			const rewrite = new Rewrite([]);
			expect(rewrite.match('/any/path')).toBeNull();
		});

		it('should rewrite simple paths', () => {
			const rewrite = new Rewrite([
				['/old', '/new'],
			]);
			expect(rewrite.match('/old')).toBe('/new');
		});

		it('should rewrite paths with parameters', () => {
			const rewrite = new Rewrite([
				['/users/:id', '/api/users/:id'],
			]);
			expect(rewrite.match('/users/123')).toBe('/api/users/123');
			expect(rewrite.match('/users/abc')).toBe('/api/users/abc');
		});

		it('should rewrite paths with multiple parameters', () => {
			const rewrite = new Rewrite([
				['/users/:userId/posts/:postId', '/api/v2/users/:userId/posts/:postId'],
			]);
			expect(rewrite.match('/users/1/posts/42')).toBe('/api/v2/users/1/posts/42');
		});

		it('should apply the first matching rule', () => {
			const rewrite = new Rewrite([
				['/path', '/first'],
				['/path', '/second'],
			]);
			expect(rewrite.match('/path')).toBe('/first');
		});

		it('should handle wildcard patterns', () => {
			const rewrite = new Rewrite([
				['/files{/*path}', '/static{/*path}'],
			]);
			expect(rewrite.match('/files/images/logo.png')).toBe('/static/images/logo.png');
			expect(rewrite.match('/files/docs/readme.txt')).toBe('/static/docs/readme.txt');
		});

		it('should handle optional parameters', () => {
			const rewrite = new Rewrite([
				['/api{/:version}/users', '/users{/:version}'],
			]);
			expect(rewrite.match('/api/v1/users')).toBe('/users/v1');
			expect(rewrite.match('/api/users')).toBe('/users');
		});
	});

	describe('caching', () => {
		it('should cache results by default', () => {
			const rewrite = new Rewrite([
				['/old/:id', '/new/:id'],
			]);

			const result1 = rewrite.match('/old/123');
			const result2 = rewrite.match('/old/123');

			expect(result1).toBe('/new/123');
			expect(result2).toBe('/new/123');
			expect(result1).toBe(result2);
		});

		it('should cache null results', () => {
			const rewrite = new Rewrite([
				['/old', '/new'],
			]);

			expect(rewrite.match('/nonexistent')).toBeNull();
			expect(rewrite.match('/nonexistent')).toBeNull();
		});

		it('should work with cache disabled', () => {
			const rewrite = new Rewrite([
				['/old/:id', '/new/:id'],
			], { cache: false });

			expect(rewrite.match('/old/123')).toBe('/new/123');
			expect(rewrite.match('/old/456')).toBe('/new/456');
		});

		it('should work with explicit cache enabled', () => {
			const rewrite = new Rewrite([
				['/old', '/new'],
			], { cache: true });

			expect(rewrite.match('/old')).toBe('/new');
			expect(rewrite.match('/old')).toBe('/new');
		});
	});

	describe('options', () => {
		it('should accept verbose option', () => {
			const rewrite = new Rewrite([
				['/old', '/new'],
			], { verbose: true });

			expect(rewrite.match('/old')).toBe('/new');
		});

		it('should accept combined options', () => {
			const rewrite = new Rewrite([
				['/old', '/new'],
			], { verbose: true, cache: false });

			expect(rewrite.match('/old')).toBe('/new');
		});
	});

	describe('edge cases', () => {
		it('should handle root path', () => {
			const rewrite = new Rewrite([
				['/', '/index'],
			]);
			expect(rewrite.match('/')).toBe('/index');
		});

		it('should handle paths with query-like segments', () => {
			const rewrite = new Rewrite([
				['/search/:query', '/find/:query'],
			]);
			expect(rewrite.match('/search/test')).toBe('/find/test');
		});

		it('should handle encoded characters in paths', () => {
			const rewrite = new Rewrite([
				['/files/:name', '/documents/:name'],
			]);
			expect(rewrite.match('/files/my%20file')).toBe('/documents/my%20file');
		});

		it('should not match partial paths', () => {
			const rewrite = new Rewrite([
				['/api', '/v1/api'],
			]);
			expect(rewrite.match('/api')).toBe('/v1/api');
			expect(rewrite.match('/api/extra')).toBeNull();
			expect(rewrite.match('/apix')).toBeNull();
		});
	});
});
