import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { IconGithub } from 'nucleo-social-media';

export default function MissionPage() {
  return (
    <div className="relative mx-auto w-full max-w-7xl px-4">
      <ScrollReveal>
        <div className="flex flex-col items-start gap-4 text-left">
          <h1 className="font-medium text-3xl text-foreground tracking-tight md:text-5xl">
            Our Mission
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
    </div>
  );
}
