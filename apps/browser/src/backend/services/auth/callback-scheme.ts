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
