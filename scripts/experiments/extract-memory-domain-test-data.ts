#!/usr/bin/env npx tsx
/**
 * Extracts memory-domain prompt test data from a stagewise
 * prod/prerelease/dev SQLite database.
 *
 * The extractor uses history-compression boundaries as stable replay
 * checkpoints for memory-domain evaluation.
 *
 * Usage:
 *   npx tsx scripts/experiments/extract-memory-domain-test-data.ts [--domain user-preferences] [--channel release|prerelease|dev] [--min-messages 6] [--overwrite]
 *
 * Output:
 *   experiments-data/memory-domains/user-preferences/<channel>/<sanitised-title>/
 *     run-001/
 *       system-prompt.md
 *       user-message.md
 *       compact-history.xml
 *       previous-memory.md
 *       metadata.json
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import superjson from 'superjson';
import { convertAgentMessagesToCompactMessageHistoryString } from '../../apps/browser/src/backend/agents/shared/base-agent/history-compression/serialization';
import {
  USER_PREFERENCES_EMPTY_MEMORY,
  USER_PREFERENCES_SYSTEM_PROMPT,
  USER_PREFERENCES_TARGET_CHARS,
  buildUserPreferencesUserMessage,
} from '../../apps/browser/src/backend/agents/shared/base-agent/memory-domains/user-preferences';
import { discoverSkills } from '../../apps/browser/src/backend/agents/shared/prompts/utils/get-skills';
import {
  extractSlashIdsFromText,
  resolveSlashSkill,
  type ResolvedSlashCommand,
} from '../../apps/browser/src/backend/agents/shared/prompts/utils/metadata-converter/slash-items';
import type { SkillDefinition } from '../../apps/browser/src/shared/skills';

type Channel = 'release' | 'prerelease' | 'dev';
type MemoryDomain = 'user-preferences';

interface ParsedArgs {
  channel: Channel;
  domain: MemoryDomain;
  minMessages: number;
  overwrite: boolean;
  skillsDir: string;
}

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: string; text?: string; [k: string]: unknown }>;
  metadata?: { compressedHistory?: string; [k: string]: unknown };
}

// ─── CLI args ────────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`Extract memory-domain prompt test data.

Usage:
  pnpm extract:memory-domain-test-data -- [options]

Options:
  --domain user-preferences       Memory domain to extract. Default: user-preferences
  --channel prerelease            release | prerelease | dev. Default: prerelease
  --min-messages 6                Minimum chat messages required. Default: 6
  --skills-dir <path>             Bundled skills root. Default: apps/browser/bundled
  --overwrite                     Accepted for compatibility; extraction always refreshes outputs
  --help                          Show this help
`);
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  let channel: Channel = 'prerelease';
  let domain: MemoryDomain = 'user-preferences';
  let minMessages = 6;
  let overwrite = false;
  let skillsDir = path.resolve('apps/browser/bundled');

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
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

    if (arg === '--min-messages' && args[i + 1]) {
      minMessages = Number.parseInt(args[++i], 10);
      if (!Number.isFinite(minMessages) || minMessages < 1) {
        console.error(`Invalid --min-messages value: ${args[i]}`);
        process.exit(1);
      }
      continue;
    }

    if (arg === '--overwrite') {
      overwrite = true;
      continue;
    }

    if (arg === '--skills-dir' && args[i + 1]) {
      skillsDir = path.resolve(args[++i]);
      continue;
    }

    console.error(`Unknown or incomplete argument: ${arg}`);
    process.exit(1);
  }

  return { channel, domain, minMessages, overwrite, skillsDir };
}

// ─── Channel → DB path ──────────────────────────────────────────────────────

function getAppBaseName(channel: Channel): string {
  switch (channel) {
    case 'release':
      return 'stagewise';
    case 'prerelease':
      return 'stagewise-prerelease';
    case 'dev':
      return 'stagewise-dev';
  }
}

function getDbPath(channel: Channel): string {
  const appData =
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.platform === 'win32'
        ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
        : path.join(os.homedir(), '.config');

  return path.join(
    appData,
    getAppBaseName(channel),
    'stagewise',
    'agents',
    'instances.sqlite',
  );
}

// ─── Skill loading ───────────────────────────────────────────────────────────

async function loadBundledSkills(
  bundledRoot: string,
): Promise<SkillDefinition[]> {
  const skillsSubdir = path.join(bundledRoot, 'skills');
  const pluginsSubdir = path.join(bundledRoot, 'plugins');

  if (!fs.existsSync(bundledRoot)) {
    console.warn(`  ⚠ Skills directory not found: ${bundledRoot}`);
    return [];
  }

  const [builtinRaw, pluginRaw] = await Promise.all([
    discoverSkills(skillsSubdir),
    discoverSkills(pluginsSubdir),
  ]);

  const builtins: SkillDefinition[] = builtinRaw.map((s) => ({
    id: `command:${s.name.toLowerCase()}`,
    displayName: s.name,
    description: s.description,
    source: 'builtin',
    contentPath: `${s.path}/SKILL.md`,
    userInvocable: s.userInvocable,
    agentInvocable: s.agentInvocable,
  }));

  const plugins: SkillDefinition[] = pluginRaw.map((s) => {
    const pluginId = path.basename(s.path);
    return {
      id: `plugin:${pluginId}:${s.name}`,
      displayName: s.name,
      description: s.description,
      source: 'plugin',
      contentPath: `${s.path}/SKILL.md`,
      pluginId,
      userInvocable: s.userInvocable,
      agentInvocable: s.agentInvocable,
    };
  });

  return [...builtins, ...plugins];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeTitle(title: string): string {
  const sanitized = title
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80);

  return sanitized || 'untitled';
}

function findCompressionPoints(messages: AgentMessage[]): number[] {
  const points: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].metadata?.compressedHistory !== undefined) {
      points.push(i);
    }
  }
  return points;
}

function findPreviousCompressionInSlice(messages: AgentMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].metadata?.compressedHistory !== undefined) {
      return i;
    }
  }
  return -1;
}

async function resolveSlashCommandsForSlice(
  messages: AgentMessage[],
  skills: SkillDefinition[],
  chatSlashCache: Map<string, ResolvedSlashCommand | null>,
): Promise<{
  resolvedSlash: Map<string, ResolvedSlashCommand>;
  slashIdsResolved: Array<{ id: string; resolved: boolean }>;
}> {
  const sliceSlashIds = new Set<string>();
  for (const m of messages) {
    if (m.role !== 'user' || !Array.isArray(m.parts)) continue;
    for (const id of extractSlashIdsFromText(m.parts)) {
      sliceSlashIds.add(id);
    }
  }

  await Promise.all(
    Array.from(sliceSlashIds).map(async (id) => {
      if (chatSlashCache.has(id)) return;
      const cmd = await resolveSlashSkill(id, skills);
      chatSlashCache.set(id, cmd);
    }),
  );

  const resolvedSlash = new Map<string, ResolvedSlashCommand>();
  const slashIdsResolved: Array<{ id: string; resolved: boolean }> = [];
  for (const id of sliceSlashIds) {
    const cmd = chatSlashCache.get(id) ?? null;
    slashIdsResolved.push({ id, resolved: cmd !== null });
    if (cmd) resolvedSlash.set(id, cmd);
  }
  slashIdsResolved.sort((a, b) => a.id.localeCompare(b.id));

  return { resolvedSlash, slashIdsResolved };
}

function getPromptPartsForDomain(
  domain: MemoryDomain,
  compactHistory: string,
  previousMemory: string,
): {
  systemPrompt: string;
  userMessage: string;
  targetMemoryChars: number;
} {
  switch (domain) {
    case 'user-preferences':
      return {
        systemPrompt: USER_PREFERENCES_SYSTEM_PROMPT,
        userMessage: buildUserPreferencesUserMessage(
          compactHistory,
          previousMemory,
        ),
        targetMemoryChars: USER_PREFERENCES_TARGET_CHARS,
      };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { channel, domain, minMessages, overwrite, skillsDir } = parseArgs();
  const dbPath = getDbPath(channel);

  if (!fs.existsSync(dbPath)) {
    console.error(`DB not found: ${dbPath}`);
    process.exit(1);
  }

  console.log(`Domain:       ${domain}`);
  console.log(`Channel:      ${channel}`);
  console.log(`DB:           ${dbPath}`);
  console.log(`Min messages: ${minMessages}`);
  console.log(
    `Overwrite:    ${overwrite ? 'yes' : 'always'} (outputs are refreshed on every extraction)`,
  );
  console.log(`Skills dir:   ${skillsDir}`);

  const skills = await loadBundledSkills(skillsDir);
  console.log(`Loaded ${skills.length} skills from bundled tree`);
  console.log('');

  const rawJson = execSync(
    `sqlite3 "${dbPath}" "SELECT json_object('id', id, 'title', title, 'lastMessageAt', last_message_at, 'history', history) FROM agentInstances ORDER BY last_message_at ASC;" 2>&1`,
    { maxBuffer: 500 * 1024 * 1024 },
  ).toString();

  const lines = rawJson.trim().split('\n').filter(Boolean);
  console.log(`Found ${lines.length} chats total\n`);

  const outDir = path.resolve(
    'experiments-data',
    'memory-domains',
    domain,
    channel,
  );
  fs.mkdirSync(outDir, { recursive: true });

  let chatsExtracted = 0;
  let chatsSkipped = 0;
  let totalRuns = 0;

  for (const line of lines) {
    let row: {
      history: string;
      id: string;
      lastMessageAt: string | number | null;
      title: string | null;
    };
    try {
      row = JSON.parse(line);
    } catch {
      console.warn('  ⚠ Could not parse row, skipping');
      chatsSkipped++;
      continue;
    }

    let messages: AgentMessage[];
    try {
      messages = superjson.parse<AgentMessage[]>(row.history);
    } catch {
      console.warn(`  ⚠ SuperJSON parse failed for "${row.title}", skipping`);
      chatsSkipped++;
      continue;
    }

    if (messages.length < minMessages) {
      chatsSkipped++;
      continue;
    }

    const compressionPoints = findCompressionPoints(messages);
    if (compressionPoints.length === 0) {
      chatsSkipped++;
      continue;
    }

    const chatTitle = row.title ?? 'Untitled';
    const chatDir = path.join(
      outDir,
      `${String(chatsExtracted + 1).padStart(3, '0')}-${sanitizeTitle(chatTitle)}`,
    );

    console.log(
      `  ✓ ${chatTitle} — ${messages.length} msgs, ${compressionPoints.length} proxy triggers`,
    );

    const chatSlashCache = new Map<string, ResolvedSlashCommand | null>();

    for (let runIdx = 0; runIdx < compressionPoints.length; runIdx++) {
      const boundaryIndex = compressionPoints[runIdx];
      const boundaryMessage = messages[boundaryIndex];
      const messagesToCompact = messages.slice(0, boundaryIndex);
      const previousMemory = USER_PREFERENCES_EMPTY_MEMORY;

      const prevCompressionIndex =
        findPreviousCompressionInSlice(messagesToCompact);
      const prevCompressionSize =
        prevCompressionIndex >= 0
          ? messagesToCompact[prevCompressionIndex].metadata!.compressedHistory!
              .length
          : 0;
      const serializedMessageCount =
        prevCompressionIndex >= 0
          ? messagesToCompact.length - prevCompressionIndex
          : messagesToCompact.length;

      const { resolvedSlash, slashIdsResolved } =
        await resolveSlashCommandsForSlice(
          messagesToCompact,
          skills,
          chatSlashCache,
        );

      const compactHistory = convertAgentMessagesToCompactMessageHistoryString(
        messagesToCompact,
        { resolvedSlash },
      );
      const { systemPrompt, userMessage, targetMemoryChars } =
        getPromptPartsForDomain(domain, compactHistory, previousMemory);

      const runDir = path.join(
        chatDir,
        `run-${String(runIdx + 1).padStart(3, '0')}`,
      );
      fs.mkdirSync(runDir, { recursive: true });

      fs.writeFileSync(path.join(runDir, 'system-prompt.md'), systemPrompt);
      fs.writeFileSync(path.join(runDir, 'user-message.md'), userMessage);
      fs.writeFileSync(
        path.join(runDir, 'compact-history.xml'),
        compactHistory,
      );
      fs.writeFileSync(path.join(runDir, 'previous-memory.md'), previousMemory);
      fs.writeFileSync(
        path.join(runDir, 'metadata.json'),
        JSON.stringify(
          {
            chatId: row.id,
            chatTitle,
            channel,
            domain,
            lastMessageAt: row.lastMessageAt,
            runNumber: runIdx + 1,
            totalRuns: compressionPoints.length,
            totalChatMessages: messages.length,
            boundaryMessageIndex: boundaryIndex,
            boundaryMessageId: boundaryMessage.id,
            totalMessagesInSlice: messagesToCompact.length,
            serializedMessageCount,
            previousCompressionIndex:
              prevCompressionIndex >= 0 ? compressionPoints[runIdx - 1] : null,
            previousCompressionSize: prevCompressionSize || null,
            compactHistoryChars: compactHistory.length,
            previousMemoryChars: previousMemory.length,
            userMessageChars: userMessage.length,
            targetMemoryChars,
            slashIdsResolved,
          },
          null,
          2,
        ),
      );

      totalRuns++;

      const resolvedCount = slashIdsResolved.filter((s) => s.resolved).length;
      console.log(
        `    run-${String(runIdx + 1).padStart(3, '0')}: boundary=${boundaryIndex}, ` +
          `${serializedMessageCount} msgs serialized, ` +
          `input=${compactHistory.length} chars, ` +
          `userMessage=${userMessage.length} chars` +
          (prevCompressionSize ? `, prev=${prevCompressionSize} chars` : '') +
          (slashIdsResolved.length > 0
            ? `, slashIds=${slashIdsResolved.length} resolved=${resolvedCount}`
            : ''),
      );
    }

    chatsExtracted++;
  }

  console.log(
    `\nDone: ${chatsExtracted} chats, ${totalRuns} ${domain} runs extracted, ${chatsSkipped} skipped → ${outDir}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
