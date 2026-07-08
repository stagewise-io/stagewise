type AuthCallbackScheme =
  | 'stagewise'
  | 'stagewise-prerelease'
  | 'stagewise-nightly'
  | 'stagewise-dev';

function getDefaultAuthCallbackScheme(): AuthCallbackScheme {
  switch (__APP_RELEASE_CHANNEL__) {
    case 'release':
      return 'stagewise';
    case 'prerelease':
      return 'stagewise-prerelease';
    case 'nightly':
      return 'stagewise-nightly';
    case 'dev':
      return 'stagewise-dev';
    default:
      throw new Error(
        `Unexpected app release channel for auth callback scheme: ${String(__APP_RELEASE_CHANNEL__)}`,
      );
  }
}

export const AUTH_CALLBACK_SCHEME = getDefaultAuthCallbackScheme();

export const AUTH_CALLBACK_PROTOCOL = `${AUTH_CALLBACK_SCHEME}:`;

// All valid stagewise callback protocols. The URIHandlerService registers
// both the stable `stagewise` scheme and the build's own scheme, so the app
// may receive callbacks on either protocol — e.g. a dev build sends
// `callback_scheme=stagewise-dev` to the console, but the console's
// allowlist may fall back to `stagewise://`, which the OS still routes to
// this app. handleAuthCallbackUrl must accept any of these.
const ALL_CALLBACK_SCHEMES: readonly AuthCallbackScheme[] = [
  'stagewise',
  'stagewise-prerelease',
  'stagewise-nightly',
  'stagewise-dev',
];

export const ALL_CALLBACK_PROTOCOLS = new Set(
  ALL_CALLBACK_SCHEMES.map((s) => `${s}:`),
);
