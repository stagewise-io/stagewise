import {
  defineConfig,
  defineCollections,
  defineDocs,
  frontmatterSchema,
} from 'fumadocs-mdx/config';
import { z } from 'zod';

export const newsPosts = defineCollections({
  type: 'doc',
  dir: 'content/news',
  schema: frontmatterSchema.extend({
    author: z.string(),
    title: z.string(),
    description: z.string(),
    date: z.string().date().or(z.date()),
    ogImage: z.string().url().optional(),
  }),
});

export const legalTexts = defineDocs({
  dir: 'content/legal',
});

export default defineConfig({
  mdxOptions: {},
});
