import { createServer, type IncomingMessage, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { app } from 'electron';
import { AUTH_CALLBACK_SCHEME } from './callback-scheme';

const LOOPBACK_HOST = '127.0.0.1';
const CALLBACK_PATH = '/auth/callback';
const SERVER_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_POST_BODY_BYTES = 4096;

function createLoopbackState(): string {
  return randomBytes(16).toString('base64url');
}

export type DevLoopbackAuthServer = {
  callbackUrl: string;
  dispose: () => Promise<void>;
};

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > MAX_POST_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// OAuth handoff tokens use URL fragments so they are not exposed in ordinary
// query-string logs. Fragments are browser-only and never reach the loopback
// HTTP server, so this page reads the fragment client-side and POSTs it back.
function fragmentRelayPage(): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Completing authentication</title></head>
  <body>
    <p>Completing authentication…</p>
    <script>
      (async () => {
        try {
          const params = new URLSearchParams(window.location.hash.slice(1));
          const response = await fetch('/auth/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              state: new URLSearchParams(window.location.search).get('state'),
              token: params.get('token'),
              error: params.get('error_description') || params.get('error'),
            }),
          });
          if (!response.ok) {
            const text = await response.text();
            document.body.textContent = text
              ? 'Failed to complete authentication: ' + response.status + ' ' + text
              : 'Failed to complete authentication: HTTP ' + response.status;
            return;
          }
          document.body.textContent = 'Authentication complete. You can close this window.';
          window.close();
        } catch {
          document.body.textContent = 'Failed to contact the local authentication server.';
        }
      })();
    </script>
  </body>
</html>`;
}

export async function createDevLoopbackAuthServer(
  onCallback: (url: string) => Promise<boolean>,
): Promise<DevLoopbackAuthServer | null> {
  if (app.isPackaged) return null;

  const loopbackState = createLoopbackState();
  let timeout: NodeJS.Timeout | null = null;
  let disposed = false;

  const server = createServer((req, res) => {
    const requestUrl = new URL(req.url ?? '/', `http://${LOOPBACK_HOST}`);

    if (requestUrl.pathname !== CALLBACK_PATH) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    void (async () => {
      if (req.method !== 'POST') {
        if (requestUrl.searchParams.get('state') !== loopbackState) {
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Invalid authentication callback.');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fragmentRelayPage());
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(await readRequestBody(req));
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid authentication callback.');
        return;
      }

      const payload = body as {
        state?: unknown;
        token?: unknown;
        error?: unknown;
      };
      if (payload.state !== loopbackState) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid authentication callback.');
        return;
      }

      const token = typeof payload.token === 'string' ? payload.token : null;
      const error = typeof payload.error === 'string' ? payload.error : null;
      if (!token && !error) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Invalid authentication callback.');
        return;
      }

      const callbackUrl = new URL(`${AUTH_CALLBACK_SCHEME}://auth/callback`);
      if (token) {
        callbackUrl.hash = `token=${encodeURIComponent(token)}`;
      } else if (error) {
        callbackUrl.searchParams.set('error', error);
      }

      const handled = await onCallback(callbackUrl.toString());

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Authentication complete</title></head>
  <body>
    <p>${handled ? 'Authentication complete. You can close this window.' : 'Authentication callback was not handled.'}</p>
    ${handled ? '<script>window.close();</script>' : ''}
  </body>
</html>`);

      await dispose();
    })().catch(() => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Failed to complete authentication.');
    });
  });

  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
    await closeServer(server);
  };

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, LOOPBACK_HOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  timeout = setTimeout(() => {
    void dispose();
  }, SERVER_TIMEOUT_MS);

  const address = server.address();
  if (!address || typeof address === 'string') {
    await dispose();
    return null;
  }

  return {
    callbackUrl: `http://${LOOPBACK_HOST}:${address.port}${CALLBACK_PATH}?state=${loopbackState}`,
    dispose,
  };
}
