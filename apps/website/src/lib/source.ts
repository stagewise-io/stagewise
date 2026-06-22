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

  // Strip leading "yy-mm-dd-" date prefix to get the public slug, e.g.
  // "26-04-08-the-coding-agent-built-for-the-web.mdx" → "the-coding-agent-built-for-the-web"
  const slug = filename
    .replace(/\.mdx?$/, '')
    .replace(/^\d{2}-\d{2}-\d{2}-/, '');

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
    (f) => f.replace(/\.mdx?$/, '').replace(/^\d{2}-\d{2}-\d{2}-/, '') === slug,
  );
  if (!filename) return null;
  return loadNewsPost(filename);
}

export function getAllNewsParams(): { slug: string[] }[] {
  return getAllNewsPosts().map((p) => ({ slug: [p.slug] }));
}

export { getNewsTypeLabel };

// ---------------------------------------------------------------------------
// Jobs / Career
// ---------------------------------------------------------------------------

export interface JobPosting {
  slug: string;
  url: string;
  title: string;
  location: string;
  /** Employment type, e.g. "Full-time", "Part-time", "Contract" */
  type: string;
  /** Department section, e.g. "Engineering", "Marketing", "Operations", "Sales" */
  section: string;
  /** Raw MDX source string */
  source: string;
}

function sanitizeSlugSegment(input: string): string | null {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : null;
}

function loadJobPosting(filename: string): JobPosting {
  const filepath = path.join(contentRoot, 'career', filename);
  const raw = fs.readFileSync(filepath, 'utf-8');
  const { data, content } = matter(raw);

  const rawSlug = filename.replace(/\.mdx?$/, '');
  const slug = sanitizeSlugSegment(rawSlug);
  if (!slug) {
    throw new Error(`Invalid job filename slug: ${filename}`);
  }

  return {
    slug,
    url: `/careers/${encodeURIComponent(slug)}`,
    title: data.title as string,
    location: data.location as string,
    type: data.type as string,
    section: data.section as string,
    source: content,
  };
}

export function getAllJobs(): JobPosting[] {
  const dir = path.join(contentRoot, 'career');
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
  return files
    .map((file) => {
      try {
        return loadJobPosting(file);
      } catch {
        return null;
      }
    })
    .filter((job): job is JobPosting => job !== null)
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getJob(slug: string): JobPosting | null {
  const dir = path.join(contentRoot, 'career');
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mdx') || f.endsWith('.md'));
  const filename = files.find((f) => f.replace(/\.mdx?$/, '') === slug);
  if (!filename) return null;
  return loadJobPosting(filename);
}

export function getAllJobParams(): { slug: string }[] {
  return getAllJobs().map((j) => ({ slug: j.slug }));
}

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
