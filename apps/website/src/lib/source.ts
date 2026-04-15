import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { getNewsTypeLabel, normalizeNewsType, type NewsType } from '@/lib/news';

const contentRoot = path.join(process.cwd(), 'content');

export interface NewsPost {
  slug: string;
  url: string;
  title: string;
  description: string;
  author: string;
  date: Date;
  type: NewsType;
  ogImage?: string;
  /** Raw MDX source string */
  source: string;
}

export interface LegalPage {
  slug: string;
  title: string;
  /** Raw MDX source string */
  source: string;
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

function loadNewsPost(filename: string): NewsPost {
  const filepath = path.join(contentRoot, 'news', filename);
  const raw = fs.readFileSync(filepath, 'utf-8');
  const { data, content } = matter(raw);

  // Strip leading "NNN-" numeric prefix to get the slug, e.g.
  // "001-the-coding-agent-built-for-the-web.mdx" â "the-coding-agent-built-for-the-web"
  const slug = filename.replace(/\.mdx?$/, '').replace(/^\d+-/, '');

  return {
    slug,
    url: `/news/${slug}`,
    title: data.title as string,
    description: data.description as string,
    author: data.author as string,
    date: new Date(data.date as string),
    type: normalizeNewsType(data.type),
    ogImage: data.ogImage as string | undefined,
    source: content,
  };
}

export function getAllNewsPosts(): NewsPost[] {
  const dir = path.join(contentRoot, 'news');
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
  return files
    .map(loadNewsPost)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function getNewsPost(slug: string): NewsPost | null {
  const dir = path.join(contentRoot, 'news');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
  const filename = files.find(
    (f) => f.replace(/\.mdx?$/, '').replace(/^\d+-/, '') === slug,
  );
  if (!filename) return null;
  return loadNewsPost(filename);
}

export function getAllNewsParams(): { slug: string[] }[] {
  return getAllNewsPosts().map((p) => ({ slug: [p.slug] }));
}

export { getNewsTypeLabel };

// ---------------------------------------------------------------------------
// Legal
// ---------------------------------------------------------------------------

function loadLegalPage(slug: string): LegalPage | null {
  const filepath = path.join(contentRoot, 'legal', `${slug}.mdx`);
  if (!fs.existsSync(filepath)) return null;
  const raw = fs.readFileSync(filepath, 'utf-8');
  const { data, content } = matter(raw);
  return {
    slug,
    title: (data.title as string) ?? slug,
    source: content,
  };
}

export function getLegalPage(slug: string): LegalPage | null {
  return loadLegalPage(slug);
}
