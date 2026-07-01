import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/vscode-extension/'],
    },
    sitemap: 'https://stagewise.io/sitemap.xml',
    host: 'https://stagewise.io',
  };
}
