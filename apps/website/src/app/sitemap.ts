import fs from 'node:fs';
import path from 'node:path';
import { getAllNewsPosts } from '@/lib/source';
import type { MetadataRoute } from 'next';

const siteUrl = 'https://stagewise.io';
const appRoot = path.join(process.cwd(), 'src', 'app');
const pageFilePattern = /^page\.(tsx|ts|jsx|js|mdx|md)$/;
const ignoredRouteSegments = new Set(['vscode-extension']);

function getLastModified(filepath: string): Date {
  return fs.statSync(filepath).mtime;
}

function getRouteFromPageFile(filepath: string): string | null {
  const relativePath = path.relative(appRoot, filepath);
  const segments = relativePath.split(path.sep);
  const pageFile = segments.at(-1);

  if (!pageFile || !pageFilePattern.test(pageFile)) return null;

  const routeSegments = segments
    .slice(0, -1)
    .filter((segment) => !segment.startsWith('(') || !segment.endsWith(')'));

  if (routeSegments.some((segment) => ignoredRouteSegments.has(segment))) {
    return null;
  }
  if (routeSegments.some((segment) => segment.startsWith('['))) return null;
  if (routeSegments.some((segment) => segment.startsWith('@'))) return null;
  if (routeSegments.some((segment) => segment.startsWith('_'))) return null;

  return `/${routeSegments.join('/')}`.replace(/\/$/, '') || '/';
}

function getPageFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'api') return [];
      if (entry.name.startsWith('_')) return [];
      return getPageFiles(entryPath);
    }

    return pageFilePattern.test(entry.name) ? [entryPath] : [];
  });
}

function createSitemapEntry(
  url: string,
  lastModified: Date,
): MetadataRoute.Sitemap[number] {
  return {
    url: new URL(url, siteUrl).toString(),
    lastModified,
    changeFrequency: 'weekly',
    priority: url === '/' ? 1 : 0.7,
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPageEntries = getPageFiles(appRoot)
    .map((filepath) => {
      const route = getRouteFromPageFile(filepath);
      if (!route) return null;

      return createSitemapEntry(route, getLastModified(filepath));
    })
    .filter((entry): entry is MetadataRoute.Sitemap[number] => entry !== null);

  const newsEntries = getAllNewsPosts().map((post) =>
    createSitemapEntry(post.url, post.date),
  );

  const entries = [...staticPageEntries, ...newsEntries];
  const dedupedEntries = new Map(entries.map((entry) => [entry.url, entry]));

  return [...dedupedEntries.values()].sort((a, b) =>
    a.url.localeCompare(b.url),
  );
}
