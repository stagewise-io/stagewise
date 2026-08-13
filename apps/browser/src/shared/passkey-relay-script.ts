/**
 * Main-world override of `navigator.credentials.get`, handing WebAuthn sign-ins
 * to the main process so pages can use the passkeys already on this machine.
 *
 * Only sign-ins are overridden. `navigator.credentials.create` is left alone:
 * registration belongs to the tab's own virtual authenticator, which is what
 * keeps a page under test from writing a passkey into the user's real keychain.
 *
 * This has to reach the page's own JavaScript context, which a preload script
 * cannot do directly — and injecting a `<script>` element is blocked outright
 * by any site with a strict `script-src` (github.com among them). So it is
 * installed over CDP with `Page.addScriptToEvaluateOnNewDocument`, which runs
 * in the main world ahead of page scripts and is not subject to CSP.
 *
 * The isolated-world half of the bridge lives in
 * `web-content-preload/passkey-relay.ts`.
 */
export const PASSKEY_RELAY_MAIN_WORLD_SCRIPT = `(() => {
  if (!window.PublicKeyCredential || !navigator.credentials) return;
  // Injected both on new documents and into the live one, so it must be safe
  // to run twice — otherwise the second run would wrap the first wrapper.
  if (window.__stagewisePasskeyRelay) return;
  window.__stagewisePasskeyRelay = true;

  const nativeGet = navigator.credentials.get.bind(navigator.credentials);

  const toB64 = (value) => {
    const view = value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    let binary = '';
    for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
    return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
  };

  const toBuffer = (value) => {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  };

  const isBinary = (value) =>
    value instanceof ArrayBuffer || ArrayBuffer.isView(value);

  // The JSON shape parseRequestOptionsFromJSON expects on the other side.
  const serialize = (options) => {
    const out = { ...options, challenge: toB64(options.challenge) };
    if (options.allowCredentials)
      out.allowCredentials = options.allowCredentials.map(
        (entry) => ({ ...entry, id: toB64(entry.id) }),
      );
    return out;
  };

  const revive = (json) => {
    const source = json.response || {};
    const response = {};
    for (const key of Object.keys(source)) {
      response[key] = typeof source[key] === 'string'
        ? toBuffer(source[key])
        : source[key];
    }
    if (source.authenticatorData)
      response.getAuthenticatorData = () => toBuffer(source.authenticatorData);

    const credential = {
      id: json.id,
      rawId: toBuffer(json.rawId || json.id),
      type: json.type || 'public-key',
      authenticatorAttachment: json.authenticatorAttachment ?? null,
      response,
      getClientExtensionResults: () => json.clientExtensionResults || {},
      toJSON: () => json,
    };
    // Own properties shadow the native accessors, but sites that check
    // \`instanceof PublicKeyCredential\` should still see one.
    try { Object.setPrototypeOf(credential, PublicKeyCredential.prototype); } catch {}
    return credential;
  };

  let nextId = 0;
  const relay = (options) => new Promise((resolve) => {
    const id = ++nextId;
    let acknowledged = false;
    const settle = (value) => {
      window.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.id !== id) return;
      if (data.__stagewisePasskeyAck) { acknowledged = true; return; }
      if (!data.__stagewisePasskeyResult) return;
      settle(data.result);
    };
    window.addEventListener('message', onMessage);
    // Overriding navigator.credentials with nothing behind it would hang every
    // WebAuthn call forever — the exact bug this is here to fix. A ceremony can
    // legitimately take minutes, so the deadline is on the bridge acknowledging
    // the request, not on the ceremony finishing.
    setTimeout(() => { if (!acknowledged) settle(null); }, 2000);
    window.postMessage(
      { __stagewisePasskeyRequest: true, id, kind: 'get', options }, '*',
    );
  });

  // Why a request was left to the tab's own authenticator, or null to relay it.
  const skipReason = (arg) => {
    if (!arg || !arg.publicKey) return 'not-a-webauthn-request';
    // Autofill runs on page load with no user intent behind it — opening a
    // browser window for that would be an ambush.
    if (arg.mediation === 'conditional') return 'conditional-mediation';
    // An abort the page can still trigger has to stay with the native call,
    // which is the only thing that knows how to honour the signal.
    if (arg.signal && arg.signal.aborted) return 'already-aborted';
    const options = arg.publicKey;
    if (options.extensions && Object.values(options.extensions).some(isBinary))
      return 'binary-extensions';
    if (!options.challenge) return 'incomplete-options';
    return null;
  };

  const log = (message) => {
    try { console.debug('[stagewise passkey] ' + message); } catch {}
  };

  navigator.credentials.get = async function (arg) {
    const skip = skipReason(arg);
    if (skip) {
      log('get handled by the tab authenticator: ' + skip);
      return nativeGet(arg);
    }

    log('get relayed to the system browser');
    let result;
    try {
      result = await relay(serialize(arg.publicKey));
    } catch (err) {
      log('get could not be serialized: ' + err);
      return nativeGet(arg);
    }
    if (result && result.ok) return revive(result.credential);

    // Anything else — no bridge, no browser, the user said no, a passkey this
    // tab already holds — leaves the request where it would have gone anyway.
    log('get relay declined: ' + (result ? result.error : 'no-bridge'));
    if (result && result.error === 'NotAllowedError')
      throw new DOMException('The operation was cancelled.', 'NotAllowedError');
    return nativeGet(arg);
  };
})();`;
