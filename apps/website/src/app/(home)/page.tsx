import type { Metadata } from 'next';
import Link from 'next/link';
import { IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import { getAllNewsPosts } from '@/lib/source';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { HeroSection } from './_components/hero-section';
import { ModelProviderShowcase } from './_components/model-provider-showcase';
import { FeatureSection } from './_components/feature-section';
import { NewsSection } from './_components/news-section';
import { CompanySection } from './_components/company-section';
import { HomeFAQ } from './_components/home-faq';
import { DownloadButtons } from './_components/download-buttons';

const softwareAppJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'stagewise',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'macOS, Windows, Linux',
  description:
    'An open-source agentic IDE — a purpose-built browser for developers with a coding agent built right in. Supports any LLM including frontier, open-weight, and locally deployed models.',
  url: 'https://stagewise.io',
  downloadUrl: 'https://stagewise.io/download',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'stagewise' },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.8',
    ratingCount: '120',
  },
};

export const metadata: Metadata = {
  title: 'The Agentic IDE for Open-Source Models · stagewise',
  description:
    'Create and orchestrate powerful AI coding agents. Use any model, including frontier, open-weight, and locally deployed ones.',
  openGraph: {
    title: 'The Agentic IDE for Open-Source Models · stagewise',
    description:
      'stagewise is a next-gen agent orchestrator for software engineers, leveraging a frontier-grade agent harness. Full model sovereignty. Runs locally, connects to anything.',
    type: 'website',
  },
  twitter: {
    title: 'The Agentic IDE for Open-Source Models · stagewise',
    description:
      'stagewise is a next-gen agent orchestrator for software engineers, leveraging a frontier-grade agent harness. Full model sovereignty. Runs locally, connects to anything.',
    creator: '@stagewise_io',
  },
  category: 'technology',
  alternates: {
    canonical: 'https://stagewise.io',
  },
  robots: { index: true, follow: true },
};

export default function Home() {
  const posts = getAllNewsPosts()
    .slice(0, 6)
    .map((p) => ({
      title: p.title,
      url: p.url,
      date: p.date.toISOString(),
      type: p.type,
    }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppJsonLd) }}
      />
      <div className="relative mx-auto mt-12 min-h-screen w-full max-w-7xl px-4">
        {/* Hero Section */}
        <HeroSection />

        {/* Model Provider Showcase */}
        <ModelProviderShowcase />

        {/* Features */}
        <FeatureSection />

        {/* Ready for your enterprise */}
        <section className="relative z-10 w-full py-20 md:py-28">
          <div className="flex justify-center">
            <ScrollReveal>
              <div className="max-w-3xl pt-8 text-center">
                <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
                  Ready for your enterprise
                </h2>
                <p className="text-base text-muted-foreground">
                  Run stagewise the way your team needs — on your
                  infrastructure, with your models, under your control.
                </p>
                <Link
                  href="/enterprise"
                  className="mt-2 inline-flex items-center gap-2 text-base text-primary-foreground hover:text-hover-derived active:text-active-derived"
                >
                  stagewise for Enterprises
                  <IconArrowRightFill18 className="inline size-4" />
                </Link>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* News section */}
        <NewsSection posts={posts} />

        {/* Company section */}
        <CompanySection />

        {/* FAQ */}
        <HomeFAQ />

        {/* Second Get Started Section */}
        <section className="relative z-10 w-full py-40 md:py-48">
          <div className="flex justify-center">
            <ScrollReveal>
              <div className="w-full max-w-7xl pt-8 text-center">
                <h2 className="mb-8 font-medium text-3xl tracking-tight md:text-5xl">
                  <span className="text-foreground">
                    The Agentic IDE for Open-Source Models
                  </span>
                </h2>

                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <DownloadButtons className="w-full sm:w-auto" />
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>
      </div>
    </>
  );
}
