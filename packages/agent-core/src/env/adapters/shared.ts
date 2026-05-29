/**
 * Helpers shared across the seven core-owned {@link DomainAdapter}
 * implementations.
 *
 * Each adapter owns its `state` shape (a Zod schema in `../types.ts`), its
 * `getState` source, and two render modes (full-state vs. state-diff)
 * implemented in `renderState`. The {@link renderChangesXml} helper here
 * keeps the diff-render path consistent across adapters and matches the
 * legacy `<env-changes>` shape the model has been trained on.
 */

/** Schema version persisted on every core adapter's `EnvStateEntry`. */
export const CORE_ENV_SCHEMA_VERSION = 1;

/**
 * Structured representation of a single environment change. Adapters
 * produce arrays of these during `renderState(prev, curr)` and render
 * them into XML via {@link renderChangesXml}.
 */
export interface EnvironmentChangeEntry {
  /** Discriminator following the `domain-action` convention. */
  type: string;
  /** Optional body text — omit when all signal is in attributes. */
  summary?: string;
  /** Rich detail content appended after summary (e.g. unified diffs). */
  detail?: string;
  /** Key-value pairs rendered as XML attributes. */
  attributes?: Record<string, string>;
}

/**
 * Render an array of structured change entries into the `<env-changes>`
 * XML block consumed by the model. Returns an empty string when
 * `entries` is empty so the adapter can fall through to an empty-string
 * render without an extra wrapper.
 */
export function renderChangesXml(entries: EnvironmentChangeEntry[]): string {
  if (entries.length === 0) return '';

  const lines = entries.map((entry) => {
    const attrs = Object.entries(entry.attributes ?? {})
      .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
      .join('');

    const body =
      entry.summary != null && entry.detail != null
        ? `${entry.summary}\n${entry.detail}`
        : entry.summary != null
          ? entry.summary
          : (entry.detail ?? null);

    const tag = entry.type;
    if (body === null) return `<${tag}${attrs} />`;

    const needsCdata = body.includes('<') || body.includes('&');
    const wrappedBody = needsCdata
      ? `<![CDATA[${body.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
      : body;
    return `<${tag}${attrs}>${wrappedBody}</${tag}>`;
  });

  return `<env-changes>\n${lines.join('\n')}\n</env-changes>`;
}

/** Escape `&` and `"` for XML attribute values. */
export function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** Escape `&`, `"`, `<`, `>` for general XML text. */
export function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
