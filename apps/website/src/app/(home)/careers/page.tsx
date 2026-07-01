import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { getAllJobs } from '@/lib/source';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Careers · stagewise',
  description:
    'Join stagewise and help build the future of AI-driven development. We are hiring in-person in San Francisco and Bielefeld.',
  openGraph: {
    title: 'Careers · stagewise',
    description:
      'Join stagewise and help build the future of AI-driven development. We are hiring in-person in San Francisco and Bielefeld.',
    type: 'website',
  },
  twitter: {
    title: 'Careers · stagewise',
    description:
      'Join stagewise and help build the future of AI-driven development. We are hiring in-person in San Francisco and Bielefeld.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function CareerPage() {
  const jobs = getAllJobs();

  return (
    <div className="relative mx-auto mt-12 w-full max-w-3xl px-4">
      <ScrollReveal>
        <div className="flex flex-col items-start gap-3 text-left">
          <h1 className="font-medium text-3xl text-foreground tracking-tight md:text-5xl">
            Careers
          </h1>
          <p className="text-lg text-muted-foreground">
            Build the future of AI-driven development
          </p>
        </div>
      </ScrollReveal>

      {/* About stagewise */}
      <section className="mt-12">
        <ScrollReveal>
          <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
            About stagewise
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <div className="flex flex-col gap-4 text-base text-muted-foreground">
            <p>
              <strong className="text-foreground">stagewise</strong> is building
              the open-source infrastructure layer for sovereign AI agents. We
              enable organizations to create, orchestrate, and operate AI agents
              across their entire business while maintaining full control over
              their models, data, and workflows.
            </p>
            <p>
              Backed by{' '}
              <strong className="text-foreground">Y Combinator</strong>, we're
              building the foundation for a future where AI agents become a core
              part of how companies build software, automate operations, and get
              work done.
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* Job listings */}
      <section className="mt-10">
        <ScrollReveal>
          <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
            Open positions
          </h2>
        </ScrollReveal>

        {jobs.length === 0 ? (
          <ScrollReveal delay={100}>
            <div className="rounded-lg bg-surface-1 p-8">
              <p className="text-muted-foreground">
                No open positions right now. Check back soon or reach out to{' '}
                <a
                  href="mailto:career@stagewise.io"
                  className="text-primary-foreground transition-colors hover:text-hover-derived"
                >
                  career@stagewise.io
                </a>{' '}
                to introduce yourself.
              </p>
            </div>
          </ScrollReveal>
        ) : (
          <ScrollReveal>
            <div className="flex flex-col gap-px overflow-hidden rounded-lg bg-surface-2">
              {jobs.map((job, index) => (
                <div key={job.slug} className="bg-surface-1">
                  <ScrollReveal delay={100 + index * 100}>
                    <Link
                      href={job.url}
                      className="group flex items-center justify-between gap-6 p-6 transition-[padding-left] hover:pl-7 active:pl-7"
                    >
                      <div className="flex flex-col gap-1">
                        <h3 className="font-medium text-foreground text-lg">
                          {job.title}
                        </h3>
                        <p className="text-muted-foreground text-sm">
                          {job.section} &middot; {job.type} &middot;{' '}
                          {job.location}
                        </p>
                      </div>
                      <svg
                        aria-hidden="true"
                        focusable="false"
                        className="pointer-events-none size-4 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M6 3l5 5-5 5" />
                      </svg>
                    </Link>
                  </ScrollReveal>
                </div>
              ))}
            </div>
          </ScrollReveal>
        )}
      </section>

      {/* Why work at stagewise */}
      <section className="mt-16">
        <ScrollReveal>
          <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
            Why work at stagewise
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <div className="flex flex-col gap-4 text-base text-muted-foreground">
            <p>
              We believe the best people do their best work when they're trusted
              with real responsibility. You'll work directly with the founders,
              help shape our strategy and product roadmap, and have the freedom
              to pursue ideas you believe will move the company forward.
            </p>
            <p>
              We're looking for people who are excited about what we're building
              and want to contribute to something very ambitious. If you want to
              help revolutionize the world with AI, you'll fit right in.
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* Our principles */}
      <section className="mt-16">
        <ScrollReveal>
          <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
            Our principles
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <ul className="flex flex-col gap-4">
            <li className="text-base text-muted-foreground">
              <span className="font-medium text-foreground">Be yourself</span>:{' '}
              We're searching for extraordinary people that bring in their own
              human touch into our team.
            </li>
            <li className="text-base text-muted-foreground">
              <span className="font-medium text-foreground">Be ambitious</span>:{' '}
              We're here to win, and this requires hard work from all of us.
            </li>
            <li className="text-base text-muted-foreground">
              <span className="font-medium text-foreground">Be humble</span>:{' '}
              The world is changing rapidly, we recognize this and are willing
              to learn continuously.
            </li>
            <li className="text-base text-muted-foreground">
              <span className="font-medium text-foreground">Be honest</span>:{' '}
              Nobody wins if we can't speak the truth. We need to be efficient
              with our time and words.
            </li>
            <li className="text-base text-muted-foreground">
              <span className="font-medium text-foreground">Be nice</span>:{' '}
              Being honest does <em>NOT</em> equal being mean. We're a team. We
              win and lose together.
            </li>
            <li className="text-base text-muted-foreground">
              <span className="font-medium text-foreground">Be visionary</span>:{' '}
              We want to make a big dent in the fabric of the universe. Standard
              solutions are not enough for this.
            </li>
          </ul>
        </ScrollReveal>
      </section>

      {/* General application CTA */}
      <section className="mt-16">
        <ScrollReveal>
          <div>
            <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
              Don't see the right fit?
            </h2>
            <p className="mb-6 text-base text-muted-foreground">
              We are always looking for exceptional people. Send us your
              background and tell us how you would contribute to stagewise.
            </p>
            <a
              href="mailto:career@stagewise.io"
              className="inline-flex items-center gap-2 text-primary-foreground transition-colors hover:text-hover-derived active:text-active-derived"
            >
              <svg
                aria-hidden="true"
                focusable="false"
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              career@stagewise.io
            </a>
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
