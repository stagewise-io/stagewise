'use client';

const COOKIE_NAME = 'stagewise-cookie-consent';
const COOKIE_DOMAIN = '.stagewise.io';
const COOKIE_MAX_AGE = 31536000; // 1 year in seconds

export type ConsentStatus = 'accepted' | 'denied' | null;

/**
 * Get the current cookie consent status
 */
export function getCookieConsent(): ConsentStatus {
  if (typeof window === 'undefined') return null;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === COOKIE_NAME) {
      return value as ConsentStatus;
    }
  }
  return null;
}

/**
 * Set the cookie consent status
 */
export function setCookieConsent(status: 'accepted' | 'denied'): void {
  if (typeof window === 'undefined') return;

  // Determine if we're in development or production
  const isDevelopment =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  // In development, don't set domain so cookie works on localhost
  // In production, set domain to .stagewise.io for cross-subdomain sharing
  const domainAttribute = isDevelopment ? '' : `; domain=${COOKIE_DOMAIN}`;

  const cookieString = `${COOKIE_NAME}=${status}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${domainAttribute}`;
  document.cookie = cookieString;
}

/**
 * Remove the cookie consent
 */
export function removeCookieConsent(): void {
  if (typeof window === 'undefined') return;

  const isDevelopment =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  const domainAttribute = isDevelopment ? '' : `; domain=${COOKIE_DOMAIN}`;

  // Set cookie with max-age=0 to delete it
  const cookieString = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax${domainAttribute}`;
  document.cookie = cookieString;
}
