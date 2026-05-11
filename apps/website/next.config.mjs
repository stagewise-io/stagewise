/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'github.com',
      },
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: 'media.licdn.com',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/docs/:path*',
        destination: 'https://docs.stagewise.io/:path*',
        permanent: true,
      },
      {
        source: '/team',
        destination: '/mission',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/auth/:path*',
        destination: 'https://api.stagewise.io/v1/auth/:path*',
      },
      {
        source: '/ingest/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://eu.i.posthog.com/decide',
      },
      {
        source: '/imprint',
        destination: '/legal-notice',
      },
      {
        source: '/socials/x',
        destination: 'https://x.com/stagewise_io',
      },
      {
        source: '/socials/discord',
        destination: 'https://discord.gg/gkdGsDYaKA',
      },
      {
        source: '/socials/linkedin',
        destination: 'https://www.linkedin.com/company/stagewise-io/',
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default config;
