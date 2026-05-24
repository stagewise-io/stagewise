/**
 * Internal URLs used by the browser.
 * These URLs are handled specially by the browser and don't navigate to external sites.
 *
 * The `stagewise://internal` origin is intentionally stable across release
 * channels. Do not couple it to OAuth callback schemes such as
 * `stagewise-dev://` or `stagewise-prerelease://`; those are OS-level deep
 * links, while this origin is the app's privileged in-browser page host.
 */

/** The home page URL - displayed when opening a new tab or on startup */
export const HOME_PAGE_URL = 'stagewise://internal/home';

/** The about page URL */
export const ABOUT_PAGE_URL = 'stagewise://internal/about';

/** The settings page URL */
export const SETTINGS_PAGE_URL =
  'stagewise://internal/agent-settings/models-providers';
export const SETTINGS_API_KEYS_PAGE_URL = `${SETTINGS_PAGE_URL}#api-keys`;
export const SETTINGS_CODING_PLANS_PAGE_URL = `${SETTINGS_PAGE_URL}#coding-plans`;

/** The history page URL */
export const HISTORY_PAGE_URL = 'stagewise://internal/history';

/** The account page URL */
export const ACCOUNT_PAGE_URL = 'stagewise://internal/account';

/** The clear data page URL */
export const CLEAR_DATA_PAGE_URL = 'stagewise://internal/clear-data';

/**
 * Checks if a URL is an internal stagewise URL.
 */
export function isInternalUrl(url: string): boolean {
  return url.startsWith('stagewise://');
}

/**
 * Checks if a URL is the home page.
 */
export function isHomePage(url: string): boolean {
  return url === HOME_PAGE_URL;
}
