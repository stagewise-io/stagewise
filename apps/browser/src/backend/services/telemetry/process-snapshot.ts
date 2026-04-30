import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Anonymised filter of executable name fragments that we track in telemetry
 * on app launch / close. Matching is case-insensitive substring against the
 * lower-cased basename of each running process. The list is ordered and only
 * the first matching token is counted for any given process, which avoids
 * double-counting overlapping substrings. We intentionally report counts
 * keyed by the filter token (not the real executable name) so this event
 * cannot leak the user's installed binaries.
 */
export const PROCESS_FILTER_TOKENS = [
  'cursor',
  'claude',
  'codex',
  'vscode',
  'zed',
  'conductor',
  'opencode',
  'openwork',
  'cowork',
] as const;

export interface ProcessSnapshot {
  matched_process_counts: Record<string, number>;
  total_matched: number;
}

const EMPTY_SNAPSHOT: ProcessSnapshot = {
  matched_process_counts: {},
  total_matched: 0,
};

/**
 * Capture a snapshot of running processes on the host, filtered down to an
 * allowlist of AI/IDE tools. Never throws — returns an empty snapshot on
 * any failure or timeout. Platform-native process listing is used:
 * `tasklist` on Windows, `ps -Ao comm=` elsewhere.
 */
export async function captureProcessSnapshot(
  timeoutMs = 1500,
): Promise<ProcessSnapshot> {
  try {
    const lines = await listProcessNames(timeoutMs);
    return countMatches(lines);
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

async function listProcessNames(timeoutMs: number): Promise<string[]> {
  if (process.platform === 'win32') {
    const { stdout } = await execFileAsync('tasklist', ['/fo', 'csv', '/nh'], {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    // CSV rows look like: "image.exe","1234","Services","0","1,234 K"
    return stdout
      .split(/\r?\n/)
      .map((row) => {
        const match = row.match(/^"([^"]+)"/);
        return match ? match[1] : '';
      })
      .filter((name) => name.length > 0);
  }

  const { stdout } = await execFileAsync('ps', ['-Ao', 'comm='], {
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function countMatches(lines: string[]): ProcessSnapshot {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const raw of lines) {
    const basename = path.basename(raw).toLowerCase();
    if (!basename) continue;

    const token = findMatchingToken(basename);
    if (!token) continue;

    counts[token] = (counts[token] ?? 0) + 1;
    total += 1;
  }
  return { matched_process_counts: counts, total_matched: total };
}

function findMatchingToken(basename: string) {
  return PROCESS_FILTER_TOKENS.find((token) => basename.includes(token));
}
