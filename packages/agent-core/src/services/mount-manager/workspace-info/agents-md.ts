import { resolve } from 'node:path';
import { readFile, stat } from '../../../fs';

const AGENTS_MD_FILENAME = 'AGENTS.md';
/**
 * Cap on AGENTS.md output length. Matches the default cap used by the
 * browser-side `capToolOutput` helper (40 KB) so agents see an
 * identical slice of the file across hosts.
 */
const MAX_AGENTS_MD_BYTES = 40 * 1024;
const TRUNCATION_INDICATOR = '\n... [truncated]';

/**
 * Read the workspace-root `AGENTS.md` file, returning `null` when it
 * does not exist. Output is capped at {@link MAX_AGENTS_MD_BYTES} to
 * keep long-lived context from blowing up the prompt. Bytes are
 * counted as UTF-8.
 */
export async function readAgentsMd(
  workspacePath: string,
): Promise<string | null> {
  const agentsMdPath = resolve(workspacePath, AGENTS_MD_FILENAME);
  try {
    await stat(agentsMdPath);
  } catch {
    return null;
  }
  try {
    const content = await readFile(agentsMdPath, 'utf-8');
    return capToMaxBytes(content);
  } catch {
    return null;
  }
}

function capToMaxBytes(content: string): string {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const encoded = encoder.encode(content);
  if (encoded.length <= MAX_AGENTS_MD_BYTES) return content;

  const indicatorBytes = encoder.encode(TRUNCATION_INDICATOR).length;
  const budget = Math.max(0, MAX_AGENTS_MD_BYTES - indicatorBytes);
  let sliced = decoder.decode(encoded.slice(0, budget));
  if (sliced.endsWith('\uFFFD')) sliced = sliced.slice(0, sliced.length - 1);
  return sliced + TRUNCATION_INDICATOR;
}
