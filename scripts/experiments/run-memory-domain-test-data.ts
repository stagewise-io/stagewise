#!/usr/bin/env npx tsx
/**
 * Runs generated memory-domain experiment bundles against an LLM and writes
 * the resulting durable memory document into each run directory.
 *
 * Usage:
 *   GOOGLE_GENERATIVE_AI_API_KEY=... pnpm run:memory-domain-test-data -- \
 *     --channel prerelease --limit 10
 *
 * Chain mode tests convergence by feeding each run's generated memory into the
 * next run. By default, memory chains per chat. Use --chain-scope global to
 * keep one memory chain across all selected runs:
 *   pnpm run:memory-domain-test-data -- --channel prerelease --chat 001 --chain --overwrite
 *   pnpm run:memory-domain-test-data -- --channel prerelease --chain --chain-scope global --overwrite
 */

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import fs from 'node:fs';
import path from 'node:path';
import {
  USER_PREFERENCES_EMPTY_MEMORY,
  USER_PREFERENCES_SYSTEM_PROMPT,
  USER_PREFERENCES_TARGET_CHARS,
  buildUserPreferencesUserMessage,
} from '../../apps/browser/src/backend/agents/shared/base-agent/memory-domains/user-preferences';

type Channel = 'release' | 'prerelease' | 'dev';
type ChainScope = 'chat' | 'global';
type MemoryDomain = 'user-preferences';
type RunOrder = 'chronological' | 'newest-first';

interface ParsedArgs {
  apiKey?: string;
  apiKeyEnv: string;
  baseURL?: string;
  channel: Channel;
  chat?: string;
  chain: boolean;
  chainScope: ChainScope;
  concurrency: number;
  domain: MemoryDomain;
  limit: number | null;
  model: string;
  offset: number;
  order: RunOrder;
  overwrite: boolean;
  retryOverBudget: boolean;
  run?: string;
}

interface RunMetadata {
  lastMessageAt?: number | string | null;
  runNumber?: number;
}

interface RunRef {
  chatDir: string;
  chatName: string;
  lastMessageAt: number | null;
  runDir: string;
  runName: string;
  runNumber: number;
}

interface RunResult {
  chainScope: ChainScope | null;
  channel: Channel;
  domain: MemoryDomain;
  durationMs: number;
  model: string;
  outputChars: number;
  previousMemoryChars: number;
  retryCount: number;
  success: boolean;
  targetMemoryChars: number;
  timestamp: string;
  usedChainMode: boolean;
  withinTarget: boolean;
}

const DEFAULT_MODEL = 'gemini-3.1-pro-preview';
const DEFAULT_API_KEY_ENV = 'GOOGLE_GENERATIVE_AI_API_KEY';
const DEFAULT_LIMIT = 10;

function printHelp(): void {
  console.log(`Run memory-domain experiment bundles against Gemini.

Usage:
  pnpm run:memory-domain-test-data -- [options]

Options:
  --domain user-preferences       Memory domain to run. Default: user-preferences
  --channel prerelease            release | prerelease | dev. Default: prerelease
  --model ${DEFAULT_MODEL}
                                  Google Generative AI model id. Default: ${DEFAULT_MODEL}
  --api-key <key>                 API key. Prefer env vars for real use
  --api-key-env <name>            Env var to read. Default: ${DEFAULT_API_KEY_ENV}
  --base-url <url>                Optional Google-compatible base URL
  --chat <folder-substring>       Only run chat folders matching this substring
  --run run-001                   Only run one run folder name
  --limit 20                      Max runs to execute. Default: ${DEFAULT_LIMIT}
  --offset 20                     Skip this many runs after filtering and ordering. Default: 0
  --order chronological|newest-first
                                  Run order. Default: chronological
  --oldest-first                  Alias for --order chronological
  --newest-first                  Alias for --order newest-first
  --all                           Run all selected bundles
  --chain                         Feed each run output into the next run. Requires --overwrite
                                  and defaults to per-chat chaining
  --chain-scope chat|global       Chain per chat or across all selected runs. Default: chat
  --overwrite                     Re-run folders with existing user-preferences.md
  --no-retry-over-budget          Disable one shorter-rewrite retry over char budget
  --concurrency 2                 Parallelism for non-chain mode. Default: 1
  --help                          Show this help

Outputs per run:
  user-preferences.md             Generated memory document
  effective-user-message.md       Actual user prompt sent to the model
  effective-previous-memory.md    Previous memory used for this run
  llm-result.json                 Timing, model, char count, validity metadata
  error.txt                       Error details if the run failed
`);
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  let apiKey: string | undefined;
  let apiKeyEnv = DEFAULT_API_KEY_ENV;
  let baseURL: string | undefined;
  let channel: Channel = 'prerelease';
  let chat: string | undefined;
  let chain = false;
  let chainScope: ChainScope = 'chat';
  let chainScopeWasSet = false;
  let concurrency = 1;
  let domain: MemoryDomain = 'user-preferences';
  let limit: number | null = DEFAULT_LIMIT;
  let model = DEFAULT_MODEL;
  let offset = 0;
  let order: RunOrder = 'chronological';
  let overwrite = false;
  let retryOverBudget = true;
  let run: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--api-key' && args[i + 1]) {
      apiKey = args[++i];
      continue;
    }

    if (arg === '--api-key-env' && args[i + 1]) {
      apiKeyEnv = args[++i];
      continue;
    }

    if (arg === '--base-url' && args[i + 1]) {
      baseURL = args[++i];
      continue;
    }

    if (arg === '--channel' && args[i + 1]) {
      const val = args[++i] as Channel;
      if (!['release', 'prerelease', 'dev'].includes(val)) {
        console.error(`Invalid channel: ${val}`);
        process.exit(1);
      }
      channel = val;
      continue;
    }

    if (arg === '--chat' && args[i + 1]) {
      chat = args[++i];
      continue;
    }

    if (arg === '--chain') {
      chain = true;
      continue;
    }

    if (arg === '--chain-scope' && args[i + 1]) {
      const val = args[++i] as ChainScope;
      if (!['chat', 'global'].includes(val)) {
        console.error(`Invalid chain scope: ${val}`);
        console.error('Supported chain scopes: chat, global');
        process.exit(1);
      }
      chainScope = val;
      chainScopeWasSet = true;
      continue;
    }

    if (arg === '--concurrency' && args[i + 1]) {
      concurrency = parsePositiveInt(args[++i], '--concurrency');
      continue;
    }

    if (arg === '--domain' && args[i + 1]) {
      const val = args[++i];
      if (val !== 'user-preferences') {
        console.error(`Unsupported memory domain: ${val}`);
        console.error('Supported domains: user-preferences');
        process.exit(1);
      }
      domain = val;
      continue;
    }

    if (arg === '--model' && args[i + 1]) {
      model = args[++i];
      continue;
    }

    if (arg === '--newest-first') {
      order = 'newest-first';
      continue;
    }

    if (arg === '--oldest-first') {
      order = 'chronological';
      continue;
    }

    if (arg === '--order' && args[i + 1]) {
      const val = args[++i] as RunOrder;
      if (!['chronological', 'newest-first'].includes(val)) {
        console.error(`Invalid run order: ${val}`);
        console.error('Supported run orders: chronological, newest-first');
        process.exit(1);
      }
      order = val;
      continue;
    }

    if (arg === '--limit' && args[i + 1]) {
      limit = parsePositiveInt(args[++i], '--limit');
      continue;
    }

    if (arg === '--all') {
      limit = null;
      continue;
    }

    if (arg === '--offset' && args[i + 1]) {
      offset = parseNonNegativeInt(args[++i], '--offset');
      continue;
    }

    if (arg === '--overwrite') {
      overwrite = true;
      continue;
    }

    if (arg === '--no-retry-over-budget') {
      retryOverBudget = false;
      continue;
    }

    if (arg === '--run' && args[i + 1]) {
      run = args[++i];
      continue;
    }

    console.error(`Unknown or incomplete argument: ${arg}`);
    process.exit(1);
  }

  if (chainScopeWasSet && !chain) {
    console.error('--chain-scope requires --chain.');
    process.exit(1);
  }

  if (chain && !overwrite) {
    console.error(
      '--chain requires --overwrite to avoid mixing stale memory outputs from previous prompts, models, or chain scopes.',
    );
    process.exit(1);
  }

  return {
    apiKey,
    apiKeyEnv,
    baseURL,
    channel,
    chat,
    chain,
    chainScope,
    concurrency,
    domain,
    limit,
    model,
    offset,
    order,
    overwrite,
    retryOverBudget,
    run,
  };
}

function parsePositiveInt(raw: string, flag: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    console.error(`Invalid ${flag} value: ${raw}`);
    process.exit(1);
  }
  return value;
}

function parseNonNegativeInt(raw: string, flag: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    console.error(`Invalid ${flag} value: ${raw}`);
    process.exit(1);
  }
  return value;
}

function getExperimentDir(domain: MemoryDomain, channel: Channel): string {
  return path.resolve('experiments-data', 'memory-domains', domain, channel);
}

function readText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

function writeText(filePath: string, content: string): void {
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`);
}

function parseRunNumber(runName: string): number {
  const match = /^run-(\d+)$/.exec(runName);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function parseTimestamp(
  value: number | string | null | undefined,
): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.length === 0) return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readRunMetadata(runDir: string): RunMetadata {
  const metadataPath = path.join(runDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) return {};

  try {
    return JSON.parse(readText(metadataPath)) as RunMetadata;
  } catch {
    return {};
  }
}

function compareRunFallback(a: RunRef, b: RunRef): number {
  const chatComparison = a.chatName.localeCompare(b.chatName);
  if (chatComparison !== 0) return chatComparison;
  return a.runName.localeCompare(b.runName);
}

function compareRuns(a: RunRef, b: RunRef, order: RunOrder): number {
  const aTime = a.lastMessageAt;
  const bTime = b.lastMessageAt;

  if (aTime !== null && bTime !== null && aTime !== bTime) {
    return order === 'chronological' ? aTime - bTime : bTime - aTime;
  }

  if (aTime !== null && bTime === null) return -1;
  if (aTime === null && bTime !== null) return 1;

  if (a.chatDir === b.chatDir && a.runNumber !== b.runNumber) {
    return order === 'chronological'
      ? a.runNumber - b.runNumber
      : b.runNumber - a.runNumber;
  }

  const fallback = compareRunFallback(a, b);
  return order === 'chronological' ? fallback : -fallback;
}

function listRuns(rootDir: string, args: ParsedArgs): RunRef[] {
  if (!fs.existsSync(rootDir)) {
    console.error(`Experiment directory not found: ${rootDir}`);
    console.error('Run extract:memory-domain-test-data first.');
    process.exit(1);
  }

  const chatNames = fs
    .readdirSync(rootDir)
    .filter((name) => fs.statSync(path.join(rootDir, name)).isDirectory())
    .filter((name) => !args.chat || name.includes(args.chat))
    .sort();

  const runs: RunRef[] = [];
  for (const chatName of chatNames) {
    const chatDir = path.join(rootDir, chatName);
    const runNames = fs
      .readdirSync(chatDir)
      .filter((name) => name.startsWith('run-'))
      .filter((name) => fs.statSync(path.join(chatDir, name)).isDirectory())
      .filter((name) => !args.run || name === args.run)
      .sort();

    for (const runName of runNames) {
      const runDir = path.join(chatDir, runName);
      const metadata = readRunMetadata(runDir);
      runs.push({
        chatDir,
        chatName,
        lastMessageAt: parseTimestamp(metadata.lastMessageAt),
        runDir,
        runName,
        runNumber: metadata.runNumber ?? parseRunNumber(runName),
      });
    }
  }

  const orderedRuns = runs.sort((a, b) => compareRuns(a, b, args.order));
  const offsetRuns = orderedRuns.slice(args.offset);
  return args.limit === null ? offsetRuns : offsetRuns.slice(0, args.limit);
}

function groupRunsByChat(runs: RunRef[], order: RunOrder): RunRef[][] {
  const groups = new Map<string, RunRef[]>();
  for (const run of runs) {
    const existing = groups.get(run.chatDir) ?? [];
    existing.push(run);
    groups.set(run.chatDir, existing);
  }

  return Array.from(groups.values()).map((group) =>
    group.sort((a, b) => compareRuns(a, b, order)),
  );
}

function getApiKey(args: ParsedArgs): string {
  const apiKey =
    args.apiKey ??
    process.env[args.apiKeyEnv] ??
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error(
      `Missing Google API key. Set ${args.apiKeyEnv}, ` +
        'GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or pass --api-key.',
    );
    process.exit(1);
  }

  return apiKey;
}

async function generateMemory(args: {
  apiKey: string;
  baseURL?: string;
  model: string;
  retryOverBudget: boolean;
  systemPrompt: string;
  userMessage: string;
}): Promise<{ retryCount: number; text: string }> {
  const google = createGoogleGenerativeAI({
    apiKey: args.apiKey,
    baseURL: args.baseURL,
  });
  const model = google(args.model);

  const first = await generateText({
    model,
    system: args.systemPrompt,
    prompt: args.userMessage,
    temperature: 0.1,
    maxOutputTokens: 2000,
  }).then((result) => result.text.trim());

  if (!args.retryOverBudget || first.length <= USER_PREFERENCES_TARGET_CHARS) {
    return { retryCount: 0, text: first };
  }

  const retry = await generateText({
    model,
    system: args.systemPrompt,
    messages: [
      { role: 'user', content: args.userMessage },
      { role: 'assistant', content: first },
      {
        role: 'user',
        content:
          `The previous output was ${first.length} characters, which exceeds ` +
          `the ${USER_PREFERENCES_TARGET_CHARS} character budget. Rewrite the ` +
          'complete memory document shorter. Output only the memory document.',
      },
    ],
    temperature: 0.1,
    maxOutputTokens: 2000,
  }).then((result) => result.text.trim());

  return { retryCount: 1, text: retry };
}

function buildPromptForRun(
  run: RunRef,
  previousMemory?: string,
): {
  previousMemory: string;
  systemPrompt: string;
  userMessage: string;
} {
  const systemPromptPath = path.join(run.runDir, 'system-prompt.md');
  const compactHistoryPath = path.join(run.runDir, 'compact-history.xml');
  const userMessagePath = path.join(run.runDir, 'user-message.md');
  const previousMemoryPath = path.join(run.runDir, 'previous-memory.md');

  const systemPrompt = fs.existsSync(systemPromptPath)
    ? readText(systemPromptPath)
    : USER_PREFERENCES_SYSTEM_PROMPT;

  const effectivePreviousMemory =
    previousMemory ??
    (fs.existsSync(previousMemoryPath)
      ? readText(previousMemoryPath).trim()
      : USER_PREFERENCES_EMPTY_MEMORY);

  if (previousMemory !== undefined) {
    const compactHistory = readText(compactHistoryPath);
    return {
      previousMemory: effectivePreviousMemory,
      systemPrompt,
      userMessage: buildUserPreferencesUserMessage(
        compactHistory,
        effectivePreviousMemory,
      ),
    };
  }

  return {
    previousMemory: effectivePreviousMemory,
    systemPrompt,
    userMessage: readText(userMessagePath),
  };
}

async function runOne(
  run: RunRef,
  args: ParsedArgs,
  apiKey: string,
  previousMemory?: string,
): Promise<string | null> {
  const outPath = path.join(run.runDir, 'user-preferences.md');
  const errorPath = path.join(run.runDir, 'error.txt');
  const resultPath = path.join(run.runDir, 'llm-result.json');

  if (!args.overwrite && fs.existsSync(outPath)) {
    console.log(`  ↷ ${run.chatName}/${run.runName}: already exists, skipped`);
    return readText(outPath).trim();
  }

  const {
    previousMemory: effectivePreviousMemory,
    systemPrompt,
    userMessage,
  } = buildPromptForRun(run, previousMemory);

  writeText(
    path.join(run.runDir, 'effective-previous-memory.md'),
    effectivePreviousMemory,
  );
  writeText(path.join(run.runDir, 'effective-user-message.md'), userMessage);

  const startedAt = Date.now();

  try {
    if (fs.existsSync(errorPath)) fs.rmSync(errorPath);

    const { retryCount, text } = await generateMemory({
      apiKey,
      baseURL: args.baseURL,
      model: args.model,
      retryOverBudget: args.retryOverBudget,
      systemPrompt,
      userMessage,
    });

    writeText(outPath, text);

    const result: RunResult = {
      chainScope: args.chain ? args.chainScope : null,
      channel: args.channel,
      domain: args.domain,
      durationMs: Date.now() - startedAt,
      model: args.model,
      outputChars: text.length,
      previousMemoryChars: effectivePreviousMemory.length,
      retryCount,
      success: true,
      targetMemoryChars: USER_PREFERENCES_TARGET_CHARS,
      timestamp: new Date().toISOString(),
      usedChainMode: previousMemory !== undefined,
      withinTarget: text.length <= USER_PREFERENCES_TARGET_CHARS,
    };

    fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);

    console.log(
      `  ✓ ${run.chatName}/${run.runName}: ${text.length} chars` +
        (retryCount > 0 ? `, retries=${retryCount}` : ''),
    );

    return text;
  } catch (err) {
    const message =
      err instanceof Error ? err.stack || err.message : String(err);
    writeText(errorPath, message);
    fs.writeFileSync(
      resultPath,
      `${JSON.stringify(
        {
          chainScope: args.chain ? args.chainScope : null,
          channel: args.channel,
          domain: args.domain,
          durationMs: Date.now() - startedAt,
          error: err instanceof Error ? err.message : String(err),
          model: args.model,
          previousMemoryChars: effectivePreviousMemory.length,
          success: false,
          timestamp: new Date().toISOString(),
          usedChainMode: previousMemory !== undefined,
        },
        null,
        2,
      )}\n`,
    );
    console.log(`  ✗ ${run.chatName}/${run.runName}: failed`);
    return null;
  }
}

async function runNonChain(
  runs: RunRef[],
  args: ParsedArgs,
  apiKey: string,
): Promise<void> {
  let index = 0;

  async function worker(): Promise<void> {
    while (index < runs.length) {
      const run = runs[index++];
      await runOne(run, args, apiKey);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(args.concurrency, runs.length) }, () =>
      worker(),
    ),
  );
}

async function runChatChain(
  runs: RunRef[],
  args: ParsedArgs,
  apiKey: string,
): Promise<void> {
  const groups = groupRunsByChat(runs, args.order);

  for (const group of groups) {
    let previousMemory: string | undefined;

    for (const run of group) {
      const output = await runOne(run, args, apiKey, previousMemory);
      if (output === null) break;
      previousMemory = output;
    }
  }
}

async function runGlobalChain(
  runs: RunRef[],
  args: ParsedArgs,
  apiKey: string,
): Promise<void> {
  let previousMemory: string | undefined;

  for (const run of runs) {
    const output = await runOne(run, args, apiKey, previousMemory);
    if (output === null) break;
    previousMemory = output;
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const apiKey = getApiKey(args);
  const rootDir = getExperimentDir(args.domain, args.channel);
  const runs = listRuns(rootDir, args);

  console.log(`Domain:      ${args.domain}`);
  console.log(`Channel:     ${args.channel}`);
  console.log(`Model:       ${args.model}`);
  console.log(`Directory:   ${rootDir}`);
  console.log(`Selected:    ${runs.length} run(s)`);
  console.log(`Order:       ${args.order}`);
  console.log(`Offset:      ${args.offset}`);
  console.log(
    `Mode:        ${args.chain ? `chain:${args.chainScope}` : 'snapshot'}`,
  );
  console.log(`Overwrite:   ${args.overwrite ? 'yes' : 'no'}`);
  console.log('');

  if (runs.length === 0) {
    console.log('No runs selected.');
    return;
  }

  if (!args.chain) {
    await runNonChain(runs, args, apiKey);
  } else if (args.chainScope === 'chat') {
    await runChatChain(runs, args, apiKey);
  } else {
    await runGlobalChain(runs, args, apiKey);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
