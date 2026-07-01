import type { Metadata } from 'next';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { EnterpriseSection } from './enterprise-section';

export const metadata: Metadata = {
  title: 'stagewise for Enterprises · stagewise',
  description:
    'Leverage AI driven development in your organization with stagewise. Control, compliance and scale for teams that need it.',
  openGraph: {
    title: 'stagewise for Enterprises · stagewise',
    description:
      'Leverage AI driven development in your organization with stagewise. Control, compliance and scale for teams that need it.',
    type: 'website',
  },
  twitter: {
    title: 'stagewise for Enterprises · stagewise',
    description:
      'Leverage AI driven development in your organization with stagewise. Control, compliance and scale for teams that need it.',
    creator: '@stagewise_io',
  },
  category: 'technology',
  alternates: {
    canonical: 'https://stagewise.io/enterprise',
  },
  robots: { index: true, follow: true },
};

export default function EnterprisePage() {
  return (
    <section className="relative z-10 mt-12 w-full pb-4 md:pb-6">
      <div className="flex justify-center">
        <div className="w-full max-w-7xl">
          <ScrollReveal>
            <div className="mb-6 flex flex-col items-start px-4 text-left md:mb-8">
              <h1 className="mb-4 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="text-foreground">
                  stagewise for Enterprises
                </span>
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
                Built for teams that need control, compliance, and scale.
              </p>
            </div>
          </ScrollReveal>

          <div className="px-4">
            <EnterpriseSection />
          </div>
        </div>
      </div>
    </section>
  );
}
