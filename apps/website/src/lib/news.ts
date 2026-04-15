export const newsTypes = ['announcements', 'technical', 'releases'] as const;

export type NewsType = (typeof newsTypes)[number];

export const newsTypeLabels: Record<NewsType, string> = {
  announcements: 'Announcements',
  technical: 'Technical',
  releases: 'Releases',
};

export const newsTypeBadgeLabels: Record<NewsType, string> = {
  announcements: 'Announcement',
  technical: 'Technical',
  releases: 'Release',
};

export function isNewsType(value: string): value is NewsType {
  return (newsTypes as readonly string[]).includes(value);
}

export function normalizeNewsType(value: unknown): NewsType {
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (isNewsType(normalized)) {
      return normalized;
    }
  }

  return 'announcements';
}

export function getNewsTypeLabel(type: NewsType): string {
  return newsTypeLabels[type];
}

export function getNewsTypeBadgeLabel(type: NewsType): string {
  return newsTypeBadgeLabels[type];
}
