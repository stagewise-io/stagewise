#!/usr/bin/env npx tsx
/**
 * Extracts history-compression test data from a stagewise prod/prerelease/dev
 * SQLite database, producing per-chat files suitable for pasting into LLM
 * playgrounds (Google AI Studio, Claude, etc.).
 *
 * Usage:
 *   npx tsx scripts/experiments/extract-compression-test-data.ts [--channel release|prerelease|dev] [--min-messages 6]
 *
 * Output:  experiments-data/history-compression/<channel>/<sanitised-title>/
 *   system-prompt.md   — the static compression instruction
 *   user-message.md    — <chat-history>…</chat-history> wrapper
 *   compact-history.xml— raw XML from convertAgentMessagesToCompactMessageHistoryString
 *   metadata.json      — chat id, title, message counts, sizes
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

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let channel: 'release' | 'prerelease' | 'dev' = 'prerelease';
  let minMessages = 6;

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
  }
  return { channel, minMessages };
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

// ─── Main ────────────────────────────────────────────────────────────────────

function sanitizeTitle(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 80);
}

function main() {
  const { channel, minMessages } = parseArgs();
  const dbPath = getDbPath(channel);

  if (!fs.existsSync(dbPath)) {
    console.error(`DB not found: ${dbPath}`);
    process.exit(1);
  }

  console.log(`Channel:      ${channel}`);
  console.log(`DB:           ${dbPath}`);
  console.log(`Min messages: ${minMessages}`);
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

  let extracted = 0;
  let skipped = 0;

  for (const line of lines) {
    let row: { id: string; title: string; history: string };
    try {
      row = JSON.parse(line);
    } catch {
      console.warn('  ⚠ Could not parse row, skipping');
      skipped++;
      continue;
    }

    // Deserialize history with SuperJSON
    let messages: AgentMessage[];
    try {
      messages = superjson.parse<AgentMessage[]>(row.history);
    } catch {
      console.warn(`  ⚠ SuperJSON parse failed for "${row.title}", skipping`);
      skipped++;
      continue;
    }

    const originalCount = messages.length;

    // Truncate at first message with compressedHistory (exclude it and after)
    const firstCompressedIdx = messages.findIndex(
      (m) => m.metadata?.compressedHistory !== undefined,
    );
    if (firstCompressedIdx !== -1) {
      messages = messages.slice(0, firstCompressedIdx);
    }

    // Also strip any compressedHistory from remaining messages (belt-and-suspenders)
    for (const msg of messages) {
      if (msg.metadata?.compressedHistory !== undefined) {
        delete msg.metadata.compressedHistory;
      }
    }

    if (messages.length < minMessages) {
      skipped++;
      continue;
    }

    // Generate the compact history string
    const compactHistory =
      convertAgentMessagesToCompactMessageHistoryString(messages);
    const userMessage = buildCompressionUserMessage(compactHistory);

    // Write output files
    const chatDir = path.join(
      outDir,
      `${String(extracted + 1).padStart(3, '0')}-${sanitizeTitle(row.title)}`,
    );
    fs.mkdirSync(chatDir, { recursive: true });

    fs.writeFileSync(
      path.join(chatDir, 'system-prompt.md'),
      COMPRESSION_SYSTEM_PROMPT,
    );
    fs.writeFileSync(path.join(chatDir, 'user-message.md'), userMessage);
    fs.writeFileSync(path.join(chatDir, 'compact-history.xml'), compactHistory);
    fs.writeFileSync(
      path.join(chatDir, 'metadata.json'),
      JSON.stringify(
        {
          id: row.id,
          title: row.title,
          channel,
          originalMessageCount: originalCount,
          extractedMessageCount: messages.length,
          truncatedAtCompression: firstCompressedIdx !== -1,
          compactHistoryChars: compactHistory.length,
          userMessageChars: userMessage.length,
        },
        null,
        2,
      ),
    );

    extracted++;
    const truncNote =
      firstCompressedIdx !== -1
        ? ` (truncated at msg ${firstCompressedIdx}/${originalCount})`
        : '';
    console.log(
      `  ✓ ${row.title} — ${messages.length} msgs, ${compactHistory.length} chars${truncNote}`,
    );
  }

  console.log(
    `\nDone: ${extracted} chats extracted, ${skipped} skipped → ${outDir}`,
  );
}

main();
