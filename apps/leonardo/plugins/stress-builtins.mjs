/**
 * Stress-test plugin: exercises a wide range of Node.js built-in APIs
 * to verify they still work after stripping debug symbols from the SEA binary.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { URL, URLSearchParams } from 'node:url';
import { promisify } from 'node:util';
import { gzipSync, gunzipSync } from 'node:zlib';
import { cpus, platform, arch, tmpdir } from 'node:os';
import { isMainThread, threadId } from 'node:worker_threads';
import { setTimeout as setTimeoutPromise } from 'node:timers/promises';
import net from 'node:net';
import http from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const results = [];

function test(name, fn) {
  try {
    const result = fn();
    results.push({ name, pass: true, result });
  } catch (err) {
    results.push({ name, pass: false, error: err.message });
  }
}

const plugin = {
  name: 'stress-builtins',
  version: '1.0.0',

  greet(who) {
    return `Stress-test says hi to ${who}`;
  },

  add(a, b) {
    return a + b;
  },

  async runTests() {
    // --- node:path ---
    test('path.resolve', () => resolve('/foo', 'bar'));
    test('path.join', () => join('a', 'b', 'c'));
    test('path.basename', () => basename('/foo/bar/baz.txt'));

    // --- node:crypto ---
    test('crypto.createHash', () => {
      const hash = createHash('sha256').update('hello').digest('hex');
      if (hash.length !== 64) throw new Error('bad hash length');
      return `${hash.slice(0, 16)}...`;
    });
    test('crypto.randomBytes', () => {
      const bytes = randomBytes(32);
      if (bytes.length !== 32) throw new Error('bad length');
      return `${bytes.length} bytes`;
    });

    // --- node:buffer ---
    test('Buffer.from', () => {
      const b = Buffer.from('hello world', 'utf-8');
      return b.toString('base64');
    });

    // --- node:events ---
    test('EventEmitter', () => {
      const ee = new EventEmitter();
      let fired = false;
      ee.on('test', () => {
        fired = true;
      });
      ee.emit('test');
      if (!fired) throw new Error('event not fired');
      return 'ok';
    });

    // --- node:url ---
    test('URL', () => {
      const u = new URL('https://example.com/path?foo=bar');
      return u.hostname;
    });
    test('URLSearchParams', () => {
      const p = new URLSearchParams({ a: '1', b: '2' });
      return p.toString();
    });

    // --- node:util ---
    test('promisify', () => {
      const fn = promisify((cb) => cb(null, 'works'));
      return typeof fn === 'function' ? 'ok' : 'fail';
    });

    // --- node:zlib ---
    test('zlib.gzip/gunzip', () => {
      const input = Buffer.from('compress me please!');
      const compressed = gzipSync(input);
      const decompressed = gunzipSync(compressed);
      if (decompressed.toString() !== 'compress me please!') {
        throw new Error('roundtrip failed');
      }
      return `${input.length}B → ${compressed.length}B → ${decompressed.length}B`;
    });

    // --- node:os ---
    test('os.cpus', () => `${cpus().length} cores`);
    test('os.platform', () => platform());
    test('os.arch', () => arch());
    test('os.tmpdir', () => (typeof tmpdir() === 'string' ? 'ok' : 'fail'));

    // --- node:worker_threads ---
    test('worker_threads.isMainThread', () => {
      if (typeof isMainThread !== 'boolean') throw new Error('not boolean');
      return `main=${isMainThread}, tid=${threadId}`;
    });

    // --- node:timers/promises ---
    test('timers/promises.setTimeout', async () => {
      await setTimeoutPromise(1);
      return 'ok';
    });

    // --- node:net ---
    test('net.isIP', () => {
      if (net.isIP('127.0.0.1') !== 4) throw new Error('ipv4 fail');
      if (net.isIP('::1') !== 6) throw new Error('ipv6 fail');
      return 'ok';
    });

    // --- node:http ---
    test('http.METHODS', () => {
      if (!http.METHODS.includes('GET')) throw new Error('no GET');
      return `${http.METHODS.length} methods`;
    });

    // --- node:stream ---
    test('stream.Readable', () => {
      const r = Readable.from(['hello']);
      return typeof r.read === 'function' ? 'ok' : 'fail';
    });
    test('stream/promises.pipeline', () => {
      return typeof pipeline === 'function' ? 'ok' : 'fail';
    });

    // --- node:fs ---
    test('fs.existsSync', () => (existsSync('/') ? 'ok' : 'fail'));

    // --- node:fs/promises ---
    test('fs/promises.readFile', async () => {
      // Read our own plugin file
      const self = await readFile(import.meta.filename, 'utf-8');
      return `${self.length} chars`;
    });

    // Await any async tests
    for (const r of results) {
      if (r.result instanceof Promise) {
        try {
          r.result = await r.result;
        } catch (err) {
          r.pass = false;
          r.error = err.message;
        }
      }
    }

    return results;
  },
};

export default plugin;
