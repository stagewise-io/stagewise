// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { isValidEmail, isValidURL } from '../src/lib/utils';

describe('utils', () => {
	describe('isValidEmail', () => {
		it('should validate correct email', () => {
			expect(isValidEmail('test@example.com')).toBe(true);
		});

		it('should reject invalid email', () => {
			expect(isValidEmail('invalid-email')).toBe(false);
		});
	});

	describe('isValidURL', () => {
		it('should validate correct URL', () => {
			expect(isValidURL('https://example.com')).toBe(true);
		});

		it('should reject invalid URL', () => {
			expect(isValidURL('not-a-url')).toBe(false);
		});
	});
});
