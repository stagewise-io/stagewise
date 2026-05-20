import type { CommandCenterItem } from './command-center-model';

export function normalizeCommandCenterQuery(query: string) {
  return query.trim().toLowerCase();
}

function includesNormalized(value: string | undefined, query: string) {
  return !!value && value.toLowerCase().includes(query);
}

function startsWithNormalized(value: string | undefined, query: string) {
  return !!value && value.toLowerCase().startsWith(query);
}

function getSearchableUrl(item: CommandCenterItem) {
  if (item.kind === 'tab' || item.kind === 'setting') return item.url;
  return undefined;
}

function getRecency(item: CommandCenterItem) {
  if (item.kind === 'agent') return item.lastMessageAt;
  if (item.kind === 'tab') return item.lastFocusedAt;
  return 0;
}

export function scoreCommandCenterItem(
  item: CommandCenterItem,
  normalizedQuery: string,
) {
  if (!normalizedQuery) return getRecency(item) > 0 ? 10 : 0;

  const title = item.title.toLowerCase();
  const subtitle = item.subtitle?.toLowerCase();
  const url = getSearchableUrl(item)?.toLowerCase();
  const keywords = item.keywords?.map((keyword) => keyword.toLowerCase()) ?? [];

  if (title === normalizedQuery) return 1000;
  if (title.startsWith(normalizedQuery)) return 900;
  if (title.includes(normalizedQuery)) return 700;
  if (keywords.some((keyword) => keyword === normalizedQuery)) return 650;
  if (keywords.some((keyword) => keyword.startsWith(normalizedQuery)))
    return 600;
  if (keywords.some((keyword) => keyword.includes(normalizedQuery))) return 500;
  if (subtitle?.includes(normalizedQuery)) return 350;
  if (url?.includes(normalizedQuery)) return 300;

  return -1;
}

export function filterAndRankCommandCenterItems<T extends CommandCenterItem>(
  items: T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeCommandCenterQuery(query);

  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreCommandCenterItem(item, normalizedQuery),
      recency: getRecency(item),
    }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.recency !== a.recency) return b.recency - a.recency;
      return a.index - b.index;
    })
    .map(({ item, score }) => ({ ...item, score }));
}

export function commandCenterItemMatchesQuery(
  item: CommandCenterItem,
  query: string,
) {
  const normalizedQuery = normalizeCommandCenterQuery(query);
  if (!normalizedQuery) return true;

  return (
    includesNormalized(item.title, normalizedQuery) ||
    includesNormalized(item.subtitle, normalizedQuery) ||
    includesNormalized(getSearchableUrl(item), normalizedQuery) ||
    !!item.keywords?.some((keyword) =>
      includesNormalized(keyword, normalizedQuery),
    ) ||
    startsWithNormalized(item.title, normalizedQuery)
  );
}
