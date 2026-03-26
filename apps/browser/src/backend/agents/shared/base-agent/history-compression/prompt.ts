/**
 * Compression prompt and user-message builder.
 *
 * Extracted into its own file so that both the runtime compression code
 * (history-compression.ts) and external tooling (e.g. extract-compression-test-data.ts)
 * can import them without pulling in heavy dependencies like `ai`.
 */

/**
 * Soft ceiling for total briefing output, in characters.
 * Once the previous briefing approaches this size the prompt instructs the
 * LLM to condense older sections to make room for new content.
 */
export const COMPRESSION_TARGET_CHARS = 30_000;

/** System prompt used by the history-compression LLM. */
export const COMPRESSION_SYSTEM_PROMPT = `You are writing a briefing for a coding AI agent about its own prior conversation with a user. The agent will read this briefing as its **only** memory of what happened before — the original conversation is permanently discarded after compression. Any detail you omit is lost forever and can never be recovered. The agent must be able to seamlessly continue working from where the briefing ends, so err on the side of including too much rather than too little.

Write in **second-person** for the agent ("you") and **third-person** for the user ("the user"). This matches how the agent's system prompt addresses it.

## Input format
The chat history uses XML-like tags:
- \`<user>...</user>\` — user messages. May contain \`[attached: ...]\`, \`[mentioned: ...]\` annotations.
- \`<assistant>...</assistant>\` — agent messages. Text content plus tool annotations.
- Tool annotations are compact one-liners like \`[read: path]\`, \`[edited: path (N edits)]\`, \`[shell: label → ✓]\`, \`[shell: label → exit 1]\`, \`[lint: paths → clean]\`, \`[lint: paths → N errors, M warnings]\`, \`[asked user: title → answers]\`, \`[created: path]\`, \`[wrote: path]\`, \`[searched: "query"]\`, etc.
- \`<previous-chat-history>...</previous-chat-history>\` — a prior briefing. Treat as established ground truth.

## What the briefing must cover
- Tasks the user asked you to do and how you approached them
- What you found, built, changed, or decided — and why
- Questions asked by either side (and answers, if given)
- Errors, dead ends, reverted approaches, or rejected alternatives
- Tool outcomes that changed direction or confirmed results (e.g. "linting revealed 3 errors in X", "curl against the live API showed the docs were wrong", "tests passed after the fix")
- The current state: what is done, what is in progress, and what is still open or unresolved

## What to preserve verbatim
- File paths: use [](wsfile:{mount-prefixed-path}) markdown links (e.g. [](wsfile:weba9/apps/browser/src/foo.ts)). Convert plain paths from tool annotations to this format. Preserve existing wsfile: links as-is.
- Markdown links from the input — copy them as-is.
- User decisions, stated preferences, constraints, and explicit rules.
- Color values, directory structures, configuration details.

## Previously compacted history and output budget
If a \`<previous-chat-history>\` block is present in the input, it contains an earlier briefing. Use **progressive recency bias** when incorporating it:
- When there is plenty of budget remaining, incorporate the previous briefing **verbatim** and append new content after it.
- When the previous briefing is already large relative to the target output size, **shorten its oldest sections in-place** to free up space for new content. The user message will tell you the target output size and the current previous briefing size so you know when shortening is needed.

Condensation rules (when shortening is needed):
- **Keep every \`##\` heading from the previous briefing.** Never merge or drop sections.
- Shorten the **oldest** sections first. Reduce their paragraphs — fewer sentences, less granular detail — but keep the same structure.
- Preserve all [](wsfile:...) links, user decisions, and outcomes even in shortened sections.
- Recent/active sections stay at full detail — do not touch them.
- A shortened section should still be 2–4 sentences minimum, never a single throwaway line.

## Structure and detail
- Use \`##\` headings to separate distinct tasks or topic phases.
- Within each topic, write flowing chronological prose — no sub-headings, no bullet lists, no tables.
- **Recency bias:** Early resolved topics get 2–4 sentences. Recent or still-active topics get full detail — specific files changed, tool outcomes, user decisions, and current status.
- If the conversation ends with an active/unresolved topic, end the briefing with its current status so the agent knows exactly where to pick up.

## Output rules
- Output ONLY the briefing content. No titles, preambles, or meta-commentary.
- **NEVER** include XML tags in your output. Do not emit \`<previous-chat-history>\`, \`</previous-chat-history>\`, \`<chat-history>\`, or any other XML wrapper tags. Output plain markdown only.
- Use \`##\` headings for topic separation. No other formatting (no bullets, no tables, no code blocks).
- Preserve markdown links verbatim from the input.
- Reference workspace files as [](wsfile:{mount-prefixed-path}) e.g. [](wsfile:w4ba9/src/foo.ts), not as inline code or plain text.
- Use your full output budget — do not cut short. The target size is a goal to aim for, not a ceiling. Longer is always better than losing detail.`;

/**
 * Builds the user message for the compression LLM.
 *
 * When a previous briefing exists, includes a dynamic budget hint that tells
 * the model whether it can incorporate the previous content verbatim or needs
 * to condense older sections to stay within the target output size.
 */
export function buildCompressionUserMessage(
  compactHistory: string,
  previousBriefingChars = 0,
): string {
  const targetChars = COMPRESSION_TARGET_CHARS;

  const ratio = previousBriefingChars / targetChars;

  let budgetHint: string;
  if (previousBriefingChars === 0) {
    budgetHint = `Your target output size is approximately ${targetChars.toLocaleString()} characters.`;
  } else if (ratio < 0.6) {
    budgetHint = `Your target output size is approximately ${targetChars.toLocaleString()} characters. The previous briefing is only ${previousBriefingChars.toLocaleString()} characters (${Math.round(ratio * 100)}% of target) — incorporate it fully and add the new content. Do NOT shorten the previous briefing.`;
  } else if (ratio < 0.85) {
    budgetHint = `Your target output size is approximately ${targetChars.toLocaleString()} characters. The previous briefing is ${previousBriefingChars.toLocaleString()} characters (${Math.round(ratio * 100)}% of target). There is still room — apply only light condensation to the oldest sections if needed, but preserve all detail from recent sections. Do NOT aggressively shorten.`;
  } else {
    budgetHint = `Your target output size is approximately ${targetChars.toLocaleString()} characters. The previous briefing is ${previousBriefingChars.toLocaleString()} characters (${Math.round(ratio * 100)}% of target) and approaching the limit. Condense the oldest, fully-resolved sections to make room, but keep all file paths, decisions, and outcomes.`;
  }

  return `<chat-history>${compactHistory}</chat-history>

${budgetHint}

Write the briefing. The agent will read this as its own memory and must be able to continue working without losing context.`;
}
