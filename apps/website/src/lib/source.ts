import { newsPosts, legalTexts } from '@/.source';
import { loader } from 'fumadocs-core/source';
import { createMDXSource } from 'fumadocs-mdx';

export const news = loader({
  baseUrl: '/news',
  source: createMDXSource(newsPosts),
  slugs: (info) => [info.name.split('-').slice(1).join('-')],
});

export const legal = loader({
  baseUrl: '/legal',
  source: legalTexts.toFumadocsSource(),
});
