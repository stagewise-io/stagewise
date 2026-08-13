import { ipcRenderer } from 'electron';

/**
 * Isolated-world half of the passkey relay: carries ceremony requests from the
 * page's own JavaScript context to the main process and the result back.
 *
 * The main-world override that produces those requests cannot be installed from
 * here — a `<script>` element is blocked by any strict `script-src` — so it is
 * injected over CDP instead. See `@shared/passkey-relay-script`.
 *
 * The page can watch and forge these messages, but the only credentials it can
 * reach that way are its own, which it could already request directly.
 */
export function installPasskeyRelayBridge(): void {
  try {
    if (window.location.protocol === 'stagewise:') return;
    if (!window.isSecureContext) return;
  } catch {
    return;
  }

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const data = event.data as {
      __stagewisePasskeyRequest?: boolean;
      id?: number;
      kind?: 'create' | 'get';
      options?: unknown;
    } | null;
    if (!data?.__stagewisePasskeyRequest || typeof data.id !== 'number') return;

    const id = data.id;
    const reply = (result: unknown) => {
      window.postMessage({ __stagewisePasskeyResult: true, id, result }, '*');
    };

    // A ceremony can take minutes, so the override cannot use a plain timeout
    // to tell "still waiting on the user" from "no bridge here at all". This
    // says the request landed; without it the override falls back.
    window.postMessage({ __stagewisePasskeyAck: true, id }, '*');

    ipcRenderer
      .invoke('passkey-relay-ceremony', {
        kind: data.kind,
        options: data.options,
      })
      .then(reply)
      .catch(() => reply({ ok: false, error: 'RelayUnavailable' }));
  });
}
