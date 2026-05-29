import { describe, it, expect } from 'vitest';
import { rustAnalyzerServer } from './rust-analyzer';

describe('rustAnalyzerServer config', () => {
  // rust-analyzer's diagnostics come from `cargo check` (flycheck), which can
  // take several seconds on a cold target cache. The LspClient default
  // diagnostics wait is 3000ms; relying on it would cut a cold flycheck off
  // and surface an empty result. This guards against accidentally dropping the
  // elevated per-server timeout. (Regression: cold Rust opens reported no
  // diagnostics because the flycheck publish landed just after 3000ms.)
  it('overrides the diagnostics wait with a generous flycheck window', () => {
    expect(rustAnalyzerServer.diagnosticsTimeoutMs).toBeDefined();
    expect(rustAnalyzerServer.diagnosticsTimeoutMs ?? 0).toBeGreaterThan(3000);
  });
});
