import { app } from 'electron';

const MAX_QUEUED_STARTUP_URLS = 10;

type StartupUrlHandler = (url: string) => void;

let installed = false;
let runtimeHandler: StartupUrlHandler | null = null;
const pendingUrls: string[] = [];

function invokeHandler(handler: StartupUrlHandler, url: string): void {
  try {
    handler(url);
  } catch {
    // A bad URL handler must not prevent later startup URLs from draining.
  }
}

function handleOrQueueUrl(url: string): void {
  if (runtimeHandler) {
    invokeHandler(runtimeHandler, url);
    return;
  }

  if (pendingUrls.length >= MAX_QUEUED_STARTUP_URLS) {
    pendingUrls.shift();
  }
  pendingUrls.push(url);
}

export function installStartupOpenUrlListener(): void {
  if (installed) return;
  installed = true;

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleOrQueueUrl(url);
  });
}

export function registerStartupUrlHandler(
  handler: StartupUrlHandler,
): () => void {
  runtimeHandler = handler;
  const urls = pendingUrls.splice(0);
  for (const url of urls) {
    invokeHandler(handler, url);
  }

  return () => {
    if (runtimeHandler === handler) {
      runtimeHandler = null;
    }
  };
}
