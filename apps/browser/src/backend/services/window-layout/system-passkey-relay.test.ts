import { describe, expect, it } from 'vitest';
import {
  authorizeCeremony,
  shouldUseLocalAuthenticator,
} from './system-passkey-relay';

/**
 * A relayed ceremony produces a real assertion for a real account, so the rules
 * about who may ask for one are the part of this feature that must not rot.
 */
describe('authorizeCeremony', () => {
  const valid = {
    kind: 'get' as const,
    inBrowsingSession: true,
    isMainFrame: true,
    frameOrigin: 'https://github.com',
  };

  it('allows a main-frame request from a browsing tab', () => {
    expect(authorizeCeremony(valid)).toEqual({
      ok: true,
      origin: 'https://github.com',
    });
  });

  it('refuses a subframe, so an iframe cannot use the page that embeds it', () => {
    // The override reaches every frame, and taking the origin from the tab
    // would let a third-party frame mint an assertion for the top-level site.
    expect(
      authorizeCeremony({
        ...valid,
        isMainFrame: false,
        frameOrigin: 'https://ads.example.com',
      }),
    ).toEqual({ ok: false, error: 'NotAMainFrame' });
  });

  it('refuses anything outside the browsing session', () => {
    expect(authorizeCeremony({ ...valid, inBrowsingSession: false })).toEqual({
      ok: false,
      error: 'NotABrowsingTab',
    });
  });

  it('refuses origins the helper browser must never be pointed at', () => {
    for (const frameOrigin of [
      'null', // sandboxed iframe
      'file:///Users/someone',
      'stagewise://internal',
      'javascript:alert(1)',
      '',
      null,
    ]) {
      expect(authorizeCeremony({ ...valid, frameOrigin })).toEqual({
        ok: false,
        error: 'BadOrigin',
      });
    }
  });

  it('refuses registration, which belongs to the tab authenticator', () => {
    // Relaying a create would put a passkey in the user's real keychain, and
    // on every device it syncs to, for a page they may only be testing.
    expect(authorizeCeremony({ ...valid, kind: 'create' })).toEqual({
      ok: false,
      error: 'BadRequest',
    });
  });

  it('refuses anything that is not a get', () => {
    for (const kind of ['store', 'preventSilentAccess', undefined, null, 7]) {
      expect(authorizeCeremony({ ...valid, kind })).toEqual({
        ok: false,
        error: 'BadRequest',
      });
    }
  });

  it('checks the request shape before trusting any of its other fields', () => {
    // A bad kind from a frame that also fails every other check should still
    // be refused, never allowed through on a technicality.
    expect(
      authorizeCeremony({
        kind: 'nonsense',
        inBrowsingSession: false,
        isMainFrame: false,
        frameOrigin: null,
      }).ok,
    ).toBe(false);
  });
});

/**
 * Getting this wrong is what makes the feature annoying rather than unsafe: a
 * passkey registered inside the preview browser would send the user to a helper
 * window that cannot possibly hold it.
 */
describe('shouldUseLocalAuthenticator', () => {
  const stored = [
    { credentialId: 'abc-_123', rpId: 'webauthn.io' },
    { credentialId: 'other', rpId: 'example.com' },
  ];

  it('keeps a discoverable request local when the tab holds a passkey', () => {
    expect(
      shouldUseLocalAuthenticator(
        { rpId: 'webauthn.io' },
        'https://webauthn.io',
        stored,
      ),
    ).toBe(true);
  });

  it('relays when the tab holds nothing for the relying party', () => {
    expect(
      shouldUseLocalAuthenticator(
        { rpId: 'github.com' },
        'https://github.com',
        stored,
      ),
    ).toBe(false);
  });

  it('falls back to the origin host when the site omits rpId', () => {
    expect(shouldUseLocalAuthenticator({}, 'https://webauthn.io', stored)).toBe(
      true,
    );
    expect(shouldUseLocalAuthenticator({}, 'https://github.com', stored)).toBe(
      false,
    );
  });

  it('matches an allowCredentials entry the tab actually holds', () => {
    expect(
      shouldUseLocalAuthenticator(
        { rpId: 'webauthn.io', allowCredentials: [{ id: 'abc-_123' }] },
        'https://webauthn.io',
        stored,
      ),
    ).toBe(true);
  });

  it('relays when the site asks only for credentials the tab lacks', () => {
    expect(
      shouldUseLocalAuthenticator(
        {
          rpId: 'webauthn.io',
          allowCredentials: [{ id: 'a-system-passkey' }],
        },
        'https://webauthn.io',
        stored,
      ),
    ).toBe(false);
  });

  it('compares ids across base64 and base64url spellings', () => {
    // CDP hands back standard base64; the page sends base64url.
    expect(
      shouldUseLocalAuthenticator(
        { rpId: 'webauthn.io', allowCredentials: [{ id: 'abc-_123' }] },
        'https://webauthn.io',
        [{ credentialId: 'abc+/123=', rpId: 'webauthn.io' }],
      ),
    ).toBe(true);
  });

  it('survives junk from the page without claiming a local passkey', () => {
    expect(shouldUseLocalAuthenticator(null, 'not a url', stored)).toBe(false);
    expect(
      shouldUseLocalAuthenticator(
        { rpId: 'webauthn.io', allowCredentials: [null, 7, {}] },
        'https://webauthn.io',
        stored,
      ),
    ).toBe(false);
  });
});
