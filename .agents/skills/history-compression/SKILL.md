---
name: history-compression
description: How stagewise's agent history compression pipeline works — boundary selection, recency bias, chained compressions, and the SQLite-backed test harness for replaying real compressions in LLM playgrounds. Use when debugging, tuning, or extending history compression, when investigating context-window overflow, or when the user wants to probe compression quality against real chat histories.
---

# History Compression

Stagewise summarizes long agent histories into a single briefing stored on a "boundary" message. Everything before the boundary is replaced by the briefing; everything after stays verbatim. Recency bias baked into both boundary math + LLM prompt.

## Key files

All paths are repo-root-relative.

- `apps/browser/src/backend/agents/shared/base-agent/base-agent.ts` — trigger + boundary logic (`compressHistoryInternal`, ~L1898; trigger check in `handlePostStep` ~L2208).
- `apps/browser/src/backend/agents/shared/base-agent/history-compression/index.ts` — model cascade + `generateSimpleCompressedHistory`.
- `apps/browser/src/backend/agents/shared/base-agent/history-compression/prompt.ts` — `COMPRESSION_SYSTEM_PROMPT`, `COMPRESSION_TARGET_CHARS = 30_000`, `buildCompressionUserMessage` (dynamic budget hint).
- `apps/browser/src/backend/agents/shared/base-agent/history-compression/serialization.ts` — `convertAgentMessagesToCompactMessageHistoryString`, `estimateMessageTokens`.
- `scripts/experiments/extract-compression-test-data.ts` — SQLite → playground-ready per-compression bundles.

## Trigger

After every step → `handlePostStep` checks:

`usedTokens > min(compactionThreshold × contextWindow, 100k)`

- `compactionThreshold` default **0.65**; chat agent overrides to **0.5**.
- `100k` hard cap (`HISTORY_COMPRESSION_HARD_CAP_TOKENS`) = 1M-ctx models trigger at same absolute count as 200k models.
- Runs via `void` (async, non-blocking). Guarded by `_isCompressingHistory` flag → no concurrent runs.
- Silent failure — agent keeps going, context overflow later surfaces normal model error.

## Boundary selection (`compressHistoryInternal`)

Kept-budget = `min(0.2 × contextWindow, 40k tokens)` (`KEPT_BUDGET_FRACTION`, `KEPT_BUDGET_HARD_CAP_TOKENS`).
Preferred floor = `max(5, config.minUncompressedMessages ?? 10)`.

Walk backward from history end:
1. Accumulate `estimateMessageTokens(msg)` until next msg would bust budget → boundary there.
2. Else stop once kept-count ≥ floor.
3. Edge: single last msg > budget → keep just that one, warn.
4. `boundary < 1` → nothing to compress, skip.

Then: `messagesToCompact = history.slice(0, boundary)` → compress → write result to `history[boundary].metadata.compressedHistory`.

### Token estimation quirks

`estimateMessageTokens` = `ceil(chars / 4)`. Includes:
- Text parts.
- Tool-call `toolName` + JSON-stringified `input` + `output`.
- Metadata overhead: env-snapshot, compressedHistory, mentions, attachments.
- **`PER_MESSAGE_OVERHEAD_CHARS = 400`** flat — accounts for XML wrappers/role tags the pipeline injects but aren't in `parts`. Without it, budget walk under-counts → compression triggers too late.

## Chained compressions

When `messagesToCompact` already contains a prior `compressedHistory`:

- Serializer (`convertAgentMessagesToCompactMessageHistoryString`) walks **backward** and **stops at first `compressedHistory` it finds**, emitting it as `<previous-chat-history>...</previous-chat-history>`. Older raw messages never re-serialized.
- `buildCompressionUserMessage` reads prior briefing length → injects ratio-bucketed budget hint:
  - `<60%` target → "incorporate verbatim, do NOT shorten".
  - `60–85%` → "light condensation to oldest sections".
  - `≥85%` → "condense oldest fully-resolved sections".
- Prompt mandates: keep every `##` heading, shorten **oldest** sections only, preserve all `[](path:...)` links + user decisions + outcomes verbatim. Recent sections untouched.

→ Chain is bounded: each round re-absorbs prior briefing under the same `30k` target.

## Serialization format

Input to LLM is XML-ish:
- `<user>` — text + `[attached: ...]`, `[mentioned: ...]` metadata annotations.
- `<assistant>` — text + one-liner tool markers: `[read: path]`, `[edited: path (N edits)]`, `[shell: label → ✓ / exit N / timed out]`, `[lint: paths → clean / N errors, M warnings]`, `[asked user: title → field: answer; ...]`, `[searched: "query"]`, `[created: path]`, `[wrote: path]`.
- `<previous-chat-history>` — inlined prior briefing (see above).
- Error state on any tool → ` ✗ <msg>` suffix.
- Unknown tool types → `[tool-xxx]` generic marker (never silently dropped).

## Prompt design (`apps/browser/src/backend/agents/shared/base-agent/history-compression/prompt.ts`)

- Target **30k chars soft** ("goal, not ceiling — longer > losing detail").
- 2nd-person for agent, 3rd-person for user.
- `##` headings per topic, flowing prose inside. No bullets/tables/code blocks.
- Recency bias: old resolved = 2–4 sentences; recent/active = full detail ending with current status.
- MUST preserve verbatim: `[](path:...)` links, markdown links, user decisions/preferences/constraints, color values, directory structures, config.
- Output plain markdown. **Never emit `<previous-chat-history>` or any XML wrapper** in output.

## Model cascade (`apps/browser/src/backend/agents/shared/base-agent/history-compression/index.ts`)

1. `gemini-3.1-flash-lite-preview` → 2. `gpt-5.4-nano` → 3. `claude-haiku-4.5`.
- Each 30s abort timeout, `temperature: 0.1`, `maxOutputTokens: 20000`.
- Min valid output: 30 chars (shorter → fallback).
- Final fallback: active chat model (only if not already tried).
- All fail → throws; caller (`compressHistoryInternal`) logs + reports, agent continues uncompressed.

## Tuning knobs

| Knob | Where | Default | Effect |
|---|---|---|---|
| `compactionThreshold` | `config.historyCompressionThreshold` | 0.65 (chat: 0.5) | Trigger fraction of ctx window |
| `HISTORY_COMPRESSION_HARD_CAP_TOKENS` | `base-agent.ts` const | 100_000 | Absolute trigger cap |
| `KEPT_BUDGET_FRACTION` | `base-agent.ts` const | 0.2 | Fraction kept uncompressed |
| `KEPT_BUDGET_HARD_CAP_TOKENS` | `base-agent.ts` const | 40_000 | Absolute kept cap |
| `minUncompressedMessages` | `config` | 10 | Floor on kept msg count |
| `COMPRESSION_TARGET_CHARS` | `prompt.ts` const | 30_000 | Soft briefing size target |
| `HISTORY_COMPRESSION_TIMEOUT_MS` | `index.ts` const | 30_000 | Per-model attempt timeout |
| `HISTORY_COMPRESSION_MODELS` | `index.ts` const | 3-model cascade | Compression model order |
| `PER_MESSAGE_OVERHEAD_CHARS` | `serialization.ts` | 400 | Metadata overhead fudge |

**Invariant:** kept budget < compression trigger (else nothing ever compresses).

## Test harness (`scripts/experiments/extract-compression-test-data.ts`)

Replays every real compression from local stagewise SQLite into playground-ready bundles.

```bash
npx tsx scripts/experiments/extract-compression-test-data.ts --channel prerelease
npx tsx scripts/experiments/extract-compression-test-data.ts --channel dev --min-messages 10
```

Channels map to `<appData>/{stagewise | stagewise-prerelease | stagewise-dev}/stagewise/agents/instances.sqlite`.

Per chat, for each boundary message (every real compression event):
- Slices `messages[0..boundary)`.
- Runs **real** `convertAgentMessagesToCompactMessageHistoryString` + `buildCompressionUserMessage` (imported from app source → fidelity guaranteed).
- Writes to `experiments-data/history-compression/<channel>/NNN-title/compression-NNN/`:
  - `system-prompt.md` — static prompt.
  - `user-message.md` — dynamic user msg with budget hint.
  - `compact-history.xml` — raw serialized input.
  - `actual-output.md` — what the real in-app LLM produced.
  - `metadata.json` — indices, char counts, prev-tag leak check.

→ Paste system + user into AI Studio/Claude → diff against `actual-output.md`. Covers full chain (1st → Nth compression) so chained-compression drift is testable.

## Common tasks

- **"Why didn't compression trigger?"** → check `usedTokens` vs trigger formula; verify `compactionThreshold ≥ 0`; check `_isCompressingHistory` not stuck.
- **"Compression is too aggressive/lossy"** → bump `COMPRESSION_TARGET_CHARS`; lower `compactionThreshold` so it triggers earlier with smaller inputs.
- **"Too few kept messages after compression"** → raise `minUncompressedMessages` or `KEPT_BUDGET_FRACTION` (but keep < trigger).
- **"Output leaks `<previous-chat-history>` tags"** → check `metadata.json` `actualOutputIncludesPreviousTag`; prompt already forbids it, likely model regression → bump cascade order.
- **"Boundary drift after compression"** → `compressHistoryInternal` re-finds boundary by `id` after LLM round-trip (user may have undone messages mid-compression); missing id → silent skip + warn.
