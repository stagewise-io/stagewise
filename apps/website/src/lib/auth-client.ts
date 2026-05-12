import { createAuthClient } from 'better-auth/react';

// Explicit type annotations prevent TS from emitting non-portable
// references to better-auth's internal `dist/client/*.mjs` paths when
// declaration files are generated (Next's TS build worker surfaces this
// as "The inferred type of 'X' cannot be named without a reference to
// '../../../../node_modules/better-auth/...'").
type BetterAuthClient = ReturnType<typeof createAuthClient>;

export const authClient: BetterAuthClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://stagewise.io',
  basePath: '/api/auth',
});

export const useSession: BetterAuthClient['useSession'] = authClient.useSession;
