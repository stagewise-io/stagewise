import { Agent } from 'undici';

// Share a connection pool across in-process model providers. Generation may
// pause during upstream routing/reasoning; only caller-owned AbortSignals
// should impose a response deadline. Keep the normal connection timeout.
// Override at dispatch time: Node fetch supplies its own 300s header/body
// limits, which would otherwise take precedence over Agent defaults.
const modelDispatcher = new Agent().compose(
  (dispatch) => (options, handler) =>
    dispatch({ ...options, headersTimeout: 0, bodyTimeout: 0 }, handler),
);

// Do not install a global dispatcher: discovery, auth, and unrelated HTTP
// requests should retain their own transport policies. Calling global fetch
// at request time also preserves instrumentation and test interception.
export const modelFetch: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, {
    ...init,
    dispatcher: modelDispatcher,
  } as RequestInit);
