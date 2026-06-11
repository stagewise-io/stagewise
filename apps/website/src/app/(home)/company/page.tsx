import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { IconGithub } from 'nucleo-social-media';

interface Backer {
  name: string;
  title?: string;
  logo?: string;
  logoAlt: string;
  link?: string;
  isFullWidth?: boolean;
}

const BACKERS: Backer[] = [
  {
    name: 'Y Combinator',
    logo: '/logos/yc-monochrome.svg',
    logoAlt: 'Y Combinator',
    link: 'https://ycombinator.com',
  },
  {
    name: 'TwentyTwo Ventures',
    logo: '/logos/twentytwo.webp',
    logoAlt: 'TwentyTwo Ventures',
    link: 'https://twentytwo.vc',
  },
  {
    name: 'Blast Club',
    logo: '/logos/blast-monochrome.svg',
    logoAlt: 'Blast Club',
    link: 'https://www.blast.club',
  },
  {
    name: 'Teuto Seed Club',
    logo: '/logos/teutoseedclub-monochrome.svg',
    logoAlt: 'Teuto Seed Club',
    link: 'https://teutoseedclub.de',
  },
  {
    name: 'Moataz Soliman',
    title: 'Co-Founder of Luciq (formerly Instabug)',
    logoAlt: 'Moataz Soliman',
  },
  {
    name: 'Eric Levine',
    title: 'Co-Founder of Berbix',
    logoAlt: 'Eric Levine',
  },
  {
    name: 'Theo Browne',
    title: 'YouTuber and founder of Ping.gg',
    logoAlt: 'Theo Browne',
  },
  {
    name: 'Reinhard Rabenstein',
    title: 'Former CTO of Diebold Nixdorf',
    logoAlt: 'Reinhard Rabenstein',
  },
  {
    name: 'Marek Lehmann',
    title: 'Co-Founder of U+I',
    logoAlt: 'Marek Lehmann',
  },
  { name: '… and many more', logoAlt: 'and many more', isFullWidth: true },
];

function BackerCell({ backer }: { backer: Backer }) {
  if (backer.isFullWidth) {
    return (
      <div className="flex min-h-20 flex-col justify-center px-6 py-4 text-center lg:col-span-full">
        <p className="font-normal text-muted-foreground text-sm">
          {backer.name}
        </p>
      </div>
    );
  }

  if (backer.logo) {
    const isSvg = backer.logo.endsWith('.svg');
    const imgEl = (
      // biome-ignore lint/performance/noImgElement: Raw <img> needed — next/image sets color:transparent breaking SVG currentColor, and stretches non-SVGs
      <img
        src={backer.logo}
        alt={backer.logoAlt}
        className={
          // biome-ignore lint/nursery/useSortedClasses: shorthand ordering
          isSvg
            ? 'h-7 shrink-0 w-auto'
            : 'h-6 shrink-0 w-auto brightness-0 grayscale dark:invert'
        }
      />
    );

    return (
      <div className="group relative flex min-h-20 flex-col items-start justify-center px-6 py-4 text-foreground transition-[padding-left] hover:pl-7 active:pl-7">
        {backer.link ? (
          <a
            href={backer.link}
            target="_blank"
            rel="noopener noreferrer"
            className="before:absolute before:inset-0"
          >
            <span className="sr-only">{backer.logoAlt}</span>
          </a>
        ) : null}
        {imgEl}
        {backer.link ? (
          <svg
            className="pointer-events-none absolute top-1/2 right-4 size-3 -translate-y-1/2 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 3l5 5-5 5" />
          </svg>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-20 flex-col justify-center px-6 py-4">
      {backer.link ? (
        <a
          href={backer.link}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-base transition-colors hover:text-hover-derived"
        >
          {backer.name}
        </a>
      ) : (
        <p className="font-medium text-base">{backer.name}</p>
      )}
      {backer.title ? (
        <p className="text-muted-foreground text-sm">{backer.title}</p>
      ) : null}
    </div>
  );
}

export default function CompanyPage() {
  return (
    <div className="relative mx-auto w-full max-w-7xl px-4">
      <ScrollReveal>
        <div className="flex flex-col items-start gap-1 text-left">
          <p className="font-medium text-muted-foreground text-sm uppercase tracking-wide">
            Company
          </p>
          <h1 className="font-medium text-3xl text-foreground tracking-tight md:text-5xl">
            Building applied AI for a better future
          </h1>
        </div>
      </ScrollReveal>

      <section className="mt-12">
        <div className="flex flex-col gap-12 lg:flex-row">
          {/* Main content */}
          <ScrollReveal delay={300}>
            <div className="prose dark:prose-invert max-w-none lg:flex-1">
              <p>
                stagewise is working towards a future where artificial
                intelligence supports human creativity with software development
                workflows and capabilities that match the users needs.
              </p>

              <p>
                Founded by{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.linkedin.com/in/juliangoetze/"
                >
                  Julian Götze
                </a>{' '}
                and{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.linkedin.com/in/glenntws/"
                >
                  Glenn Töws
                </a>
                , stagewise emerged from a fundamental belief: The next
                generation of developers and designers deserve tools that
                amplify their intent, not constrain it. The tools of the future
                don't force users into a fixed way of working, but rather adapt
                to their ways of thinking and doing.
              </p>

              <p>
                The company's early traction validates this vision. Within
                months of launch, stagewise reached 6,000+ stars on{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://github.com/stagewise-io/stagewise"
                >
                  GitHub
                </a>{' '}
                and earned acceptance into{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.ycombinator.com/companies?batch=Summer%202025"
                >
                  Y Combinator's Summer 2025 batch
                </a>
                , signaling strong alignment with the market's evolving needs.
              </p>

              <p>
                Looking ahead, stagewise is building the infrastructure layer
                for AI-native web development, fitting into a world where
                creating exceptional user experiences requires neither extensive
                technical overhead nor compromise on quality.
              </p>
            </div>
          </ScrollReveal>

          {/* CTA sidebar */}
          <ScrollReveal delay={400}>
            <div className="flex flex-col gap-8 border-border/30 lg:w-80 lg:shrink-0 lg:border-l lg:pl-8">
              <div>
                <h3 className="mb-3 font-medium text-foreground text-xl">
                  Join our team
                </h3>
                <p className="mb-4 text-muted-foreground text-sm">
                  We're looking for talented engineers who want to shape the
                  future of developer tooling. Write us with your name,
                  location, and experience.
                </p>
                <a
                  href="mailto:career@stagewise.io"
                  className="text-primary-foreground underline underline-offset-4 transition-colors hover:text-hover-derived active:text-active-derived"
                >
                  career@stagewise.io
                </a>
              </div>

              <div>
                <h3 className="mb-3 font-medium text-foreground text-xl">
                  Contribute on GitHub
                </h3>
                <p className="mb-4 text-muted-foreground text-sm">
                  stagewise is open source. Join our community and help build
                  the future of development.
                </p>
                <a
                  href="https://github.com/stagewise-io/stagewise"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-hover-derived"
                >
                  <IconGithub className="size-4" />
                  View on GitHub
                </a>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Backed by section */}
      <section className="mt-24">
        <ScrollReveal>
          <h2 className="mb-10 font-medium text-2xl tracking-tight md:text-3xl">
            Backed by leading firms and experts
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-surface-2 sm:grid-cols-2 lg:grid-cols-3 [&>*]:bg-surface-1">
            {BACKERS.map((backer) => (
              <BackerCell key={backer.name} backer={backer} />
            ))}
          </div>
        </ScrollReveal>
      </section>
    </div>
  );
}
