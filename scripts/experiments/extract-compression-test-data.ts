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

      // Generate the compact history — this is the exact input the
      // compression LLM received.
      const compactHistory =
        convertAgentMessagesToCompactMessageHistoryString(messagesToCompact);
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
          },
          null,
          2,
        ),
      );

      totalCompressions++;

      console.log(
        `    compression-${String(cpIdx + 1).padStart(3, '0')}: boundary=${boundaryIndex}, ` +
          `${serializedMessageCount} msgs serialized, ` +
          `input=${compactHistory.length} chars, ` +
          `output=${actualOutput.length} chars` +
          (prevCompressionSize ? `, prev=${prevCompressionSize} chars` : ''),
      );
    }

    chatsExtracted++;
  }

  console.log(
    `\nDone: ${chatsExtracted} chats, ${totalCompressions} compressions extracted, ${chatsSkipped} skipped → ${outDir}`,
  );
}

main();
