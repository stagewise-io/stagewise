import { source } from '@/lib/source';
import {
  DocsPage,
  DocsBody,
  DocsDescription,
  DocsTitle,
} from 'fumadocs-ui/page';
import { redirect } from 'next/navigation';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { getMDXComponents } from '@/mdx-components';
import { CopyMarkdownButton } from '@/components/copy-markdown-button';
import { readFile } from 'node:fs/promises';
import { join, normalize, relative } from 'node:path';
import type { Metadata } from 'next';

// Sanitize slug to prevent path traversal attacks
function sanitizeSlug(slug: string[] | undefined): string {
  if (!slug || slug.length === 0) return 'index';

  // Join the slug parts and normalize
  const slugPath = slug.join('/');

  // Remove any path traversal attempts and restrict to safe characters
  const sanitized = slugPath
    .replace(/\.\./g, '') // Remove .. sequences
    .replace(/[^a-zA-Z0-9\-_/]/g, '') // Only allow alphanumeric, hyphens, underscores, and forward slashes
    .replace(/\/+/g, '/') // Collapse multiple slashes
    .replace(/^\/|\/$/g, ''); // Remove leading/trailing slashes

  return sanitized || 'index';
}

// Remove frontmatter and export statements from markdown content
function cleanMarkdownContent(content: string): string {
  // Remove YAML frontmatter (content between --- at the beginning)
  let cleaned = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');

  // Remove export statements (lines starting with export)
  cleaned = cleaned.replace(/^export\s+.*$/gm, '');

  // Remove empty lines at the beginning
  cleaned = cleaned.replace(/^\s*\n+/, '');

  return cleaned;
}

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) redirect('/docs');

  const MDXContent = page.data.body;

  // Get the raw markdown content for the copy button
  let markdownContent = '';
  try {
    const sanitizedSlug = sanitizeSlug(params.slug);
    const docsDir = join(process.cwd(), 'content/docs');
    const filePath = join(docsDir, `${sanitizedSlug}.mdx`);

    // Ensure the resolved path is still within the docs directory
    const normalizedPath = normalize(filePath);
    const relativePath = relative(docsDir, normalizedPath);

    if (relativePath.startsWith('..') || relativePath.includes('..')) {
      throw new Error('Invalid file path');
    }

    const rawContent = await readFile(normalizedPath, 'utf-8');
    markdownContent = cleanMarkdownContent(rawContent);
  } catch (_error) {
    // Fallback if file reading fails
    markdownContent = page.data.title || '';
  }

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <div className="relative">
        <div className="absolute top-0 right-0 z-10">
          <CopyMarkdownButton content={markdownContent} />
        </div>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
      </div>
      <DocsBody>
        <MDXContent
          components={getMDXComponents({
            // this allows you to link to other pages with relative file paths
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) redirect('/docs');

  const metadata: Metadata = {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      title: page.data.title,
      description: page.data.description,
      locale: 'en_US',
    },
    twitter: {
      title: page.data.title,
      description: page.data.description,
      creator: '@stagewise_io',
    },
    category: 'Documentation',
    applicationName: 'stagewise',
    publisher: 'stagewise',
  };

  return metadata;
}
