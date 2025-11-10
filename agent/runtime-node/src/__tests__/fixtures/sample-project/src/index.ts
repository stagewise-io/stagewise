// @ts-nocheck
import { isValidEmail } from './lib/utils';
import { capitalize } from './lib/helpers';

/**
 * Main entry point
 */
export function main() {
  console.log('Hello World');
  console.error('This is an error message');

  const email = 'test@example.com';
  if (isValidEmail(email)) {
    console.log('Valid email:', email);
  }

  return capitalize('hello');
}

// TODO: Add more functionality
// FIXME: Handle edge cases
