import type { HighlightRequest, HighlightResponse } from './shiki-worker';

declare global {
  interface Window {
    __stagewise_shiki_worker_proxy?: ShikiWorkerProxy;
  }
}

class ShikiWorkerProxy {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (html: string) => void; reject: (err: Error) => void }
  >();

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./shiki-worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (e: MessageEvent<HighlightResponse>) => {
        const res = e.data;
        const entry = this.pending.get(res.id);
        if (!entry) return;
        this.pending.delete(res.id);
        if ('error' in res) {
          entry.reject(new Error(res.error));
        } else {
          entry.resolve(res.html);
        }
      };
      this.worker.onerror = (e) => {
        e.preventDefault();
        const err = new Error(`Shiki worker error: ${e.message ?? 'unknown'}`);
        // Reject all pending promises so callers don't hang
        this.pending.forEach((entry) => entry.reject(err));
        this.pending.clear();
        // Discard the worker so next call re-creates it
        this.worker = null;
      };
    }
    return this.worker;
  }

  highlightCode(
    code: string,
    language: string,
    preClassName?: string,
    compactDiff?: boolean,
    mode: 'full' | 'streaming' = 'full',
  ): Promise<string> {
    const id = this.nextId++;
    const worker = this.ensureWorker();

    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({
        id,
        code,
        language,
        preClassName,
        compactDiff,
        mode,
      } satisfies HighlightRequest);
    });
  }
}

export function getShikiWorkerProxy(): ShikiWorkerProxy {
  if (!window.__stagewise_shiki_worker_proxy) {
    window.__stagewise_shiki_worker_proxy = new ShikiWorkerProxy();
  }
  return window.__stagewise_shiki_worker_proxy;
}
