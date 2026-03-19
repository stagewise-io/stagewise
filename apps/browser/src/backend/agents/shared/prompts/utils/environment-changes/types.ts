/**
 * Structured representation of a single environment change.
 * Used by all compute*Changes functions for consistent rendering.
 *
 * - When only `type` + `attributes` are present the entry renders as a
 *   self-closing tag: `<entry type="..." attr="..." />`
 * - When `summary` is present it becomes the element body.
 * - When `detail` is also present it is appended after the summary (e.g.
 *   unified diffs).
 */
export interface EnvironmentChangeEntry {
  /** Discriminator following `domain-action` convention */
  type: string;
  /** Optional body text — omit when all signal is in attributes */
  summary?: string;
  /** Rich detail content appended after summary (e.g. unified diff) */
  detail?: string;
  /** Key-value pairs rendered as XML attributes */
  attributes?: Record<string, string>;
}

/**
 * Renders an array of environment change entries into the
 * `<env-changes>` XML block consumed by the model.
 */
export function renderEnvironmentChangesXml(
  entries: EnvironmentChangeEntry[],
): string {
  if (entries.length === 0) return '';

  const lines = entries.map((entry) => {
    const attrs = Object.entries(entry.attributes ?? {})
      .map(
        ([k, v]) =>
          ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`,
      )
      .join('');

    const body =
      entry.summary != null && entry.detail != null
        ? `${entry.summary}\n${entry.detail}`
        : entry.summary != null
          ? entry.summary
          : (entry.detail ?? null);

    const tag = entry.type;

    if (body === null) {
      return `<${tag}${attrs} />`;
    }

    const needsCdata = body.includes('<') || body.includes('&');
    const wrappedBody = needsCdata
      ? `<![CDATA[${body.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`
      : body;

    return `<${tag}${attrs}>${wrappedBody}</${tag}>`;
  });

  return `<env-changes>\n${lines.join('\n')}\n</env-changes>`;
}
