#!/usr/bin/env npx tsx
/**
 * Extracts history-compression test data from a stagewise prod/prerelease/dev
 * SQLite database, producing per-compression files suitable for pasting into
 * LLM playgrounds (Google AI Studio, Claude, etc.).
 *
 * For each chat that has at least one compression point, every compression is
 * extracted — including the 1st (no previous briefing) through the Nth
 * (compounding briefing). This lets you test the full compression chain.
 *
 * Usage:
 *   npx tsx scripts/experiments/extract-compression-test-data.ts [--channel release|prerelease|dev] [--min-messages 6]
 *
 * Output:
 *   experiments-data/history-compression/<channel>/<sanitised-title>/
 *     compression-001/              # 1st compression (no previous history)
 *       system-prompt.md            # static compression instruction
 *       user-message.md             # buildCompressionUserMessage(compactHistory)
 *       compact-history.xml         # raw serialized input
 *       actual-output.md            # what the LLM actually produced (from DB)
 *       metadata.json               # counts, sizes, indices
 *     compression-002/              # 2nd compression (has <previous-chat-history>)
 *       ...
 *     compression-NNN/
 *       ...
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import superjson from 'superjson';
import { convertAgentMessagesToCompactMessageHistoryString } from '../../apps/browser/src/backend/agents/shared/base-agent/history-compression/serialization';
import {
  COMPRESSION_SYSTEM_PROMPT,
  buildCompressionUserMessage,
} from '../../apps/browser/src/backend/agents/shared/base-agent/history-compression/prompt';
import { discoverSkills } from '../../apps/browser/src/backend/agents/shared/prompts/utils/get-skills';
import {
  extractSlashIdsFromText,
  resolveSlashSkill,
  type ResolvedSlashCommand,
} from '../../apps/browser/src/backend/agents/shared/prompts/utils/metadata-converter/slash-items';
import type { SkillDefinition } from '../../apps/browser/src/shared/skills';

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let channel: 'release' | 'prerelease' | 'dev' = 'prerelease';
  let minMessages = 6;
  let skillsDir = path.resolve('apps/browser/bundled');

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--channel' && args[i + 1]) {
      const val = args[i + 1] as typeof channel;
      if (!['release', 'prerelease', 'dev'].includes(val)) {
        console.error(`Invalid channel: ${val}`);
        process.exit(1);
      }
      channel = val;
      i++;
    }
    if (args[i] === '--min-messages' && args[i + 1]) {
      minMessages = Number.parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === '--skills-dir' && args[i + 1]) {
      skillsDir = path.resolve(args[i + 1]);
      i++;
    }
  }
  return { channel, minMessages, skillsDir };
}

// ─── Channel → DB path ──────────────────────────────────────────────────────

function getAppBaseName(channel: 'release' | 'prerelease' | 'dev'): string {
  switch (channel) {
    case 'release':
      return 'stagewise';
    case 'prerelease':
      return 'stagewise-prerelease';
    case 'dev':
      return 'stagewise-dev';
  }
}

function getDbPath(channel: 'release' | 'prerelease' | 'dev'): string {
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

// ─── Types ───────────────────────────────────────────────────────────────────

interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: Array<{ type: string; text?: string; [k: string]: unknown }>;
  metadata?: { compressedHistory?: string; [k: string]: unknown };
}

// ─── Skill loading ───────────────────────────────────────────────────────────

/**
 * Loads bundled builtin + plugin skills from the repo's `apps/browser/bundled/`
 * tree and returns them as `SkillDefinition[]` compatible with
 * `resolveSlashSkill`. ID formats match the live runtime exactly:
 *  - builtins: `command:${name.toLowerCase()}` (see apps/browser/src/backend/main.ts)
 *  - plugins:  `plugin:${pluginId}:${skill.name}` (see apps/browser/src/backend/services/toolbox/index.ts)
 *
 * `bundledRoot` should point at `apps/browser/bundled`. If the directory is
 * missing, returns an empty array and logs a warning.
 */
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
  return title
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80);
}

/**
 * Finds all message indices that carry a compressedHistory in their metadata.
 */
function findCompressionPoints(messages: AgentMessage[]): number[] {
  const points: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].metadata?.compressedHistory !== undefined) {
      points.push(i);
    }
  }
  return points;
}

/**
 * Finds the index of the previous compression point within a message slice,
 * walking backward from the end. Returns -1 if none found.
 */
function findPreviousCompressionInSlice(messages: AgentMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].metadata?.compressedHistory !== undefined) {
      return i;
    }
  }
  return -1;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { channel, minMessages, skillsDir } = parseArgs();
  const dbPath = getDbPath(channel);

  if (!fs.existsSync(dbPath)) {
    console.error(`DB not found: ${dbPath}`);
    process.exit(1);
  }

  console.log(`Channel:      ${channel}`);
  console.log(`DB:           ${dbPath}`);
  console.log(`Min messages: ${minMessages}`);
  console.log(`Skills dir:   ${skillsDir}`);

  const skills = await loadBundledSkills(skillsDir);
  console.log(`Loaded ${skills.length} skills from bundled tree`);
  console.log('');

  // Query all agent instances
  const rawJson = execSync(
    `sqlite3 "${dbPath}" "SELECT json_object('id', id, 'title', title, 'history', history) FROM agentInstances ORDER BY last_message_at DESC;" 2>&1`,
    { maxBuffer: 500 * 1024 * 1024 }, // 500MB buffer for large DBs
  ).toString();

  const lines = rawJson.trim().split('\n').filter(Boolean);
  console.log(`Found ${lines.length} chats total\n`);

  const outDir = path.resolve(
    'experiments-data',
    'history-compression',
    channel,
  );
  fs.mkdirSync(outDir, { recursive: true });

  let chatsExtracted = 0;
  let chatsSkipped = 0;
  let totalCompressions = 0;

  for (const line of lines) {
    let row: { id: string; title: string; history: string };
    try {
      row = JSON.parse(line);
    } catch {
      console.warn('  ⚠ Could not parse row, skipping');
      chatsSkipped++;
      continue;
    }

    // Deserialize history with SuperJSON
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

    // Find all compression points
    const compressionPoints = findCompressionPoints(messages);
    if (compressionPoints.length === 0) {
      chatsSkipped++;
      continue;
    }

    const chatDir = path.join(
      outDir,
      `${String(chatsExtracted + 1).padStart(3, '0')}-${sanitizeTitle(row.title)}`,
    );

    console.log(
      `  ✓ ${row.title} — ${messages.length} msgs, ${compressionPoints.length} compressions`,
    );

    // Per-chat cache: memoize slash resolution across this chat's compressions.
    // `null` means "tried and not found" so we don't re-try every compression.
    const chatSlashCache = new Map<string, ResolvedSlashCommand | null>();

    // Extract each compression point
    for (let cpIdx = 0; cpIdx < compressionPoints.length; cpIdx++) {
      const boundaryIndex = compressionPoints[cpIdx];
      const boundaryMessage = messages[boundaryIndex];
      const actualOutput = boundaryMessage.metadata!.compressedHistory!;

      // Reproduce what base-agent does: messagesToCompact = history[0..boundary)
      // Keep compressedHistory on earlier messages so the serializer's backward
      // walk naturally finds the previous compression and emits
      // <previous-chat-history>.
      const messagesToCompact = messages.slice(0, boundaryIndex);

      // Find previous compression within the slice (for metadata)
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

      // Gather unique slash IDs referenced in this compression's user messages
      // and resolve each (with per-chat caching).
      const sliceSlashIds = new Set<string>();
      for (const m of messagesToCompact) {
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

      // Generate the compact history — this is the exact input the
      // compression LLM received (post-fix: slash bodies inlined).
      const compactHistory = convertAgentMessagesToCompactMessageHistoryString(
        messagesToCompact,
        {
          resolvedSlash,
        },
      );
      const userMessage = buildCompressionUserMessage(
        compactHistory,
        prevCompressionSize,
      );

      const compressionDir = path.join(
        chatDir,
        `compression-${String(cpIdx + 1).padStart(3, '0')}`,
      );
      fs.mkdirSync(compressionDir, { recursive: true });

      fs.writeFileSync(
        path.join(compressionDir, 'system-prompt.md'),
        COMPRESSION_SYSTEM_PROMPT,
      );
      fs.writeFileSync(
        path.join(compressionDir, 'user-message.md'),
        userMessage,
      );
      fs.writeFileSync(
        path.join(compressionDir, 'compact-history.xml'),
        compactHistory,
      );
      fs.writeFileSync(
        path.join(compressionDir, 'actual-output.md'),
        actualOutput,
      );
      fs.writeFileSync(
        path.join(compressionDir, 'metadata.json'),
        JSON.stringify(
          {
            chatId: row.id,
            chatTitle: row.title,
            channel,
            compressionNumber: cpIdx + 1,
            totalCompressions: compressionPoints.length,
            totalChatMessages: messages.length,
            boundaryMessageIndex: boundaryIndex,
            boundaryMessageId: boundaryMessage.id,
            totalMessagesInSlice: messagesToCompact.length,
            serializedMessageCount,
            previousCompressionIndex:
              prevCompressionIndex >= 0 ? compressionPoints[cpIdx - 1] : null,
            previousCompressionSize: prevCompressionSize || null,
            compactHistoryChars: compactHistory.length,
            userMessageChars: userMessage.length,
            actualOutputChars: actualOutput.length,
            actualOutputIncludesPreviousTag: actualOutput.includes(
              '<previous-chat-history>',
            ),
            slashIdsResolved,
          },
          null,
          2,
        ),
      );

      totalCompressions++;

      const resolvedCount = slashIdsResolved.filter((s) => s.resolved).length;
      console.log(
        `    compression-${String(cpIdx + 1).padStart(3, '0')}: boundary=${boundaryIndex}, ` +
          `${serializedMessageCount} msgs serialized, ` +
          `input=${compactHistory.length} chars, ` +
          `output=${actualOutput.length} chars` +
          (prevCompressionSize ? `, prev=${prevCompressionSize} chars` : '') +
          (sliceSlashIds.size > 0
            ? `, slashIds=${sliceSlashIds.size} resolved=${resolvedCount}`
            : ''),
      );
    }

    chatsExtracted++;
  }

  console.log(
    `\nDone: ${chatsExtracted} chats, ${totalCompressions} compressions extracted, ${chatsSkipped} skipped → ${outDir}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
