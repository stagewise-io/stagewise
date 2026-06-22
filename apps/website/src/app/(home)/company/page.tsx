import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { IconGithub } from 'nucleo-social-media';
import { IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import { getAllJobs } from '@/lib/source';
import Image from 'next/image';
import Link from 'next/link';
import bgDark from '../_components/feature-images/bg-dark.jpg';
import bgLight from '../_components/feature-images/bg-light.jpg';
import githubRepoIssuesDark from '../_components/feature-images/github-repo-issues-dark.webp';
import githubRepoIssuesLight from '../_components/feature-images/github-repo-issues-light.webp';
import foundersImage from './team-pic.jpg';

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

function BackerCell({ backer, index }: { backer: Backer; index: number }) {
  const contentDelay = index * 100;
  if (backer.isFullWidth) {
    return (
      <div className="flex min-h-20 flex-col justify-center px-6 py-6 text-center lg:col-span-full">
        <ScrollReveal delay={contentDelay}>
          <p className="font-normal text-muted-foreground text-sm">
            {backer.name}
          </p>
        </ScrollReveal>
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
          isSvg
            ? 'h-7 w-auto shrink-0 dark:invert'
            : 'h-6 w-auto shrink-0 brightness-0 grayscale dark:invert'
        }
      />
    );

    return (
      <div className="group relative flex min-h-20 flex-col items-start justify-center px-6 py-6 text-foreground transition-[padding-left] hover:pl-7 active:pl-7">
        {backer.link ? (
          <a
            href={backer.link}
            target="_blank"
            rel="noopener noreferrer"
            className="before:absolute before:inset-0 before:content-['']"
          >
            <span className="sr-only">{backer.logoAlt}</span>
          </a>
        ) : null}
        <ScrollReveal delay={contentDelay}>{imgEl}</ScrollReveal>
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
    <div className="flex min-h-20 flex-col justify-center px-6 py-6">
      <ScrollReveal delay={contentDelay}>
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
      </ScrollReveal>
    </div>
  );
}

export default function CompanyPage() {
  const jobs = getAllJobs();

  return (
    <div className="relative mx-auto mt-12 w-full max-w-5xl px-4">
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
        <ScrollReveal>
          <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-12 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
            <p>
              stagewise exists because we think agents should be partners that{' '}
              <strong>tackle work autonomously</strong>, not something you talk
              to on the side.
            </p>

            <p>
              We started in software development, where one problem kept showing
              up again and again: agents were getting more capable, but they
              still could not see enough of the environment they were supposed
              to help with. So we built a way to feed{' '}
              <strong>live context</strong> from the app under development — the
              running UI, the selected element, the surrounding code — straight
              into the agent, so it could work from the actual state of the
              product instead of from a thin prompt.
            </p>

            <p>
              That shaped how we think about this space. Better models alone do
              not solve the real problem. If an agent has no context, no memory,
              no way into the surrounding systems, and no clear limits on what
              it can do, it will always need you to act as its operator and
              gateway to the real world instead of doing things on its own.
            </p>

            <h2 className="font-medium text-foreground text-xl">
              The future of artificial intelligence is generalized
            </h2>

            <p>
              That is what shaped stagewise: first as a tool for development,
              then as an open-source platform for professional agents.
            </p>

            <p>
              Now we are growing out of the software development space and into
              a broader agent platform. We are doing that because we do not
              think agents should be boxed in by one hosting setup, one machine,
              one device, or one narrow class of software. They should be able
              to connect to whatever people already use: laptops, phones,
              internal tools, modern agent-ready systems, and older human-native
              apps that were never designed for agents in the first place. And
              not just into one of these systems at a time, but doing meaningful
              work across platforms, databases, and machines in parallel.
            </p>

            <div className="not-prose my-12 rounded-lg bg-surface-1 p-6">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
                <Image
                  src={foundersImage}
                  alt="Glenn Töws and Julian Götze, the founders of stagewise"
                  className="w-full shrink-0 rounded-md md:max-h-64 md:w-auto md:max-w-1/2"
                  sizes="(min-width: 768px) 50vw, 100vw"
                  quality={95}
                />
                <div className="space-y-6">
                  <h2 className="font-medium text-2xl text-foreground tracking-tight md:text-3xl">
                    Meet our founders
                  </h2>
                  <div className="grid grid-cols-1 gap-x-10 gap-y-3 md:grid-cols-2 md:gap-x-24">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground text-lg">
                        Glenn Töws
                      </p>
                      <p className="text-muted-foreground text-sm">
                        Chief Executive Officer
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium text-foreground text-lg">
                        Julian Götze
                      </p>
                      <p className="text-muted-foreground text-sm">
                        Chief Technology Officer
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <h2 className="font-medium text-foreground text-xl">
              Openness, Configurability, Affordability and Simplicity
            </h2>

            <p>
              A platform for autonomous agents has to be open and configurable.{' '}
              <em>Open</em>, because this layer is too important to be trapped
              inside a closed stack. <em>Configurable</em>, because different
              users, teams, and companies need different boundaries,
              permissions, and levels of autonomy.
            </p>

            <p>
              As a team, we do not believe a future built on a single provider,
              model stack, or API is good enough. People should be able to
              choose how their agents are built, what they connect to, and how
              those systems evolve over time.
            </p>

            <p>
              We also think the current market is upside down in a way that
              feels almost unfair. Today's agents are really only accessible to
              the people who have a significant chunk of money to pay for the
              currently used models, and who have the knowledge to do the
              grunt-work of setting the agent up and keeping it running.
              Everyone else gets a brittle experience: too much configuration,
              too many moving parts, things breaking for reasons nobody has time
              to debug. This bothers us massively, and we think the future can
              look brighter if we build a platform that focuses on fixing these
              issues.
            </p>

            <p>
              We do not want AI to be useful only for people who can tolerate
              constant setup friction. We do not want people to have to learn a
              whole new operating model just to benefit from these systems. We
              do not want to gate autonomous and truly helpful AI behind costs
              that make the unit economics not add up anymore.
            </p>

            <h2 className="font-medium text-foreground text-xl">
              Outcome-maxxing, not Token-maxxing
            </h2>

            <p>
              With everything we do, we strive to build products that don't
              follow hype or vanity metrics. This includes focusing on the right
              numbers, and working backwards from the outcome our users want to
              see.
            </p>

            <p>
              Our goal is <em>not</em> to make our users use as many tokens as
              possible, or to maximize SOTA model usage. Instead, our target is
              to build agents that{' '}
              <strong>reliably generate a positive outcome for the user</strong>{' '}
              over and over, while minimizing the amount of time and energy (and
              thus cost!) that was spent to reach this outcome.
            </p>

            <p>
              We want to do so without requiring the user to think extensively
              about optimizing the agent, just like you would never try to
              introspect and optimize the brain of a human in your workforce
              (unless you are very weird. Don't do that, please). Instead, you
              should expect the agent to learn and optimize itself autonomously.
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* Backed by section */}
      <section className="mt-20">
        <ScrollReveal>
          <h2 className="mb-10 font-medium text-2xl tracking-tight md:text-3xl">
            Backed by leading firms and experts
          </h2>
        </ScrollReveal>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg bg-surface-2 sm:grid-cols-2 lg:grid-cols-3 [&>*]:bg-surface-1">
          {BACKERS.map((backer, index) => (
            <BackerCell key={backer.name} backer={backer} index={index} />
          ))}
        </div>
      </section>

      <section className="mt-20">
        <ScrollReveal>
          <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-12 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
            <h2 className="font-medium text-foreground text-xl">
              What if agents are hyper-autonomous?
            </h2>

            <p>
              This is the question we are asking ourselves all the time when we
              think about the future of work with AI. And it's also how we shape
              the vision of our products. What would it mean for agents to pick
              up work directly from GitHub, where issues are discussed and
              prioritized? How should they participate in Jira or Teams, where
              product decisions are actually made?
            </p>

            <p>
              What changes when the system can notice what matters, ask for
              input, and take the next step within limits the user has set,
              instead of waiting for a human to initiate everything?
            </p>

            <p>
              While a future where this is true is certainly not without risk
              for its users, we are confident that responsible and thoughtful
              development towards this future unlocks possibilities that are
              difficult to imagine. And in light of that, doing so in a way that
              unlocks this power for everyone is more important than ever.
            </p>

            <h2 className="font-medium text-foreground text-xl">
              The north star
            </h2>

            <p>
              We are building toward a platform where agents can move across
              different environments, work with people and other agents, and
              stay useful as goals, tools, and teams change around them.
            </p>

            <p>
              <strong>
                Humans decide where agents are used, what they can access, and
                how much autonomy they get.
              </strong>{' '}
              The agents, in turn, should be present with any modality the user
              may want to use. In a way that resembles how humans already
              interact with other humans, and with a level of reliability and
              intelligence that makes you feel at ease.
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* CTA cards */}
      <section className="mt-20">
        <ScrollReveal>
          <h2 className="mb-10 font-medium text-2xl tracking-tight md:text-3xl">
            Participate in our journey
          </h2>
        </ScrollReveal>
        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2">
          <ScrollReveal className="h-full">
            <div className="h-full rounded-lg bg-surface-1 p-8">
              <h3 className="mb-3 font-medium text-foreground text-xl">
                Join our team
              </h3>
              <p className="mb-10 text-muted-foreground text-sm">
                We're hiring in-person in San Francisco and Bielefeld.
              </p>
              <ul className="mb-10 divide-y divide-border/50">
                {jobs.map((job) => (
                  <li key={job.slug} className="py-4 first:pt-0 last:pb-0">
                    <Link
                      href={job.url}
                      className="group flex flex-col gap-1 transition-colors hover:text-hover-derived"
                    >
                      <span className="truncate font-medium text-foreground text-sm">
                        {job.title}
                      </span>
                      <span className="truncate text-muted-foreground text-xs">
                        {job.type} &middot; {job.location}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mb-6 text-muted-foreground text-sm">
                We expect applicants to be sophisticated users of AI-driven
                development tooling and workflows.
              </p>
              <Link
                href="/careers"
                className="inline-flex w-fit items-center gap-2 text-primary-foreground transition-colors hover:text-hover-derived active:text-active-derived"
              >
                View all positions
                <IconArrowRightFill18 className="inline size-4" />
              </Link>
            </div>
          </ScrollReveal>
          <ScrollReveal className="h-full" delay={75}>
            <div className="flex h-full flex-col gap-6 rounded-lg bg-surface-1 p-8">
              <h3 className="font-medium text-foreground text-xl">
                Contribute on GitHub
              </h3>
              <div
                className="relative w-full overflow-hidden rounded-md ring-1 ring-surface-2"
                style={{ aspectRatio: '16 / 9' }}
              >
                <Image
                  src={bgLight}
                  className="absolute inset-0 h-full w-full object-cover dark:hidden"
                  alt=""
                  sizes="(min-width: 1280px) 560px, (min-width: 768px) 45vw, calc(100vw - 80px)"
                  quality={70}
                />
                <Image
                  src={bgDark}
                  className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                  alt=""
                  sizes="(min-width: 1280px) 560px, (min-width: 768px) 45vw, calc(100vw - 80px)"
                  quality={70}
                />
                <Image
                  src={githubRepoIssuesLight}
                  className="absolute top-0 left-0 w-full dark:hidden"
                  style={{
                    transform: 'scale(1.5)',
                    transformOrigin: 'top left',
                  }}
                  alt="GitHub repo issues view"
                  sizes="(min-width: 1280px) 840px, (min-width: 768px) 70vw, 100vw"
                  quality={80}
                />
                <Image
                  src={githubRepoIssuesDark}
                  className="absolute top-0 left-0 hidden w-full dark:block"
                  style={{
                    transform: 'scale(1.5)',
                    transformOrigin: 'top left',
                  }}
                  alt="GitHub repo issues view"
                  sizes="(min-width: 1280px) 840px, (min-width: 768px) 70vw, 100vw"
                  quality={80}
                />
              </div>
              <p className="text-muted-foreground text-sm">
                stagewise is open source. Join our community and help build the
                future of development.
              </p>
              <a
                href="https://github.com/stagewise-io/stagewise"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-2 text-primary-foreground transition-colors hover:text-hover-derived active:text-active-derived"
              >
                <IconGithub className="size-4" />
                View on GitHub
              </a>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
