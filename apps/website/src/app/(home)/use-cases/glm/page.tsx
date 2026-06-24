import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { DownloadButtons } from '../../_components/home-client';
import { HeroImage } from './hero-image';

export const metadata: Metadata = {
  title: 'An Open-Source IDE Built for GLM · stagewise',
  description:
    'Use GLM 5.2 from Z.AI in stagewise. Artificial Analysis places it unusually close to Claude Opus 4.8 on intelligence, while the cost sits much lower.',
  openGraph: {
    title: 'An Open-Source IDE Built for GLM · stagewise',
    description:
      'Use GLM 5.2 from Z.AI in stagewise. Artificial Analysis places it unusually close to Claude Opus 4.8 on intelligence, while the cost sits much lower.',
    type: 'website',
  },
  twitter: {
    title: 'An Open-Source IDE Built for GLM · stagewise',
    description:
      'Use GLM 5.2 from Z.AI in stagewise. Artificial Analysis places it unusually close to Claude Opus 4.8 on intelligence, while the cost sits much lower.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function GLMUseCasePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative z-10 mt-12 w-full pb-4 md:pb-6">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl">
            <ScrollReveal>
              <div className="mt-0 mb-6 flex flex-col items-start px-4 text-left md:mt-2 md:mb-8">
                <h1 className="mb-4 font-medium text-3xl tracking-tight md:text-5xl">
                  <span className="text-foreground">
                    An Open-Source IDE Built for GLM
                  </span>
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  GLM 5.2 is compelling for a simple reason: it gets unusually
                  close to Claude Opus 4.8 in quality while sitting at a much
                  lower cost point. stagewise gives it a local IDE built for
                  long-running agent work.
                </p>
                <div className="mt-8">
                  <DownloadButtons />
                </div>
              </div>
            </ScrollReveal>

            {/* Hero image */}
            <ScrollReveal delay={200}>
              <div className="mt-6 mb-6 px-4 md:mt-8 md:mb-8">
                <HeroImage />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Why GLM 5.2 stands out */}
      <section className="relative z-10 w-full py-6 md:py-8">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Why GLM 5.2 stands out right now
                </h2>
                <p>
                  The main case for GLM 5.2 is not that it is merely good for an
                  open-weight model. It is that it gets surprisingly close to
                  Claude Opus 4.8 on capability while landing in a very
                  different cost range.
                </p>
                <p>
                  <a
                    href="https://artificialanalysis.ai/articles/glm-5-2-is-the-new-leading-open-weights-model-on-the-artificial-analysis-intelligence-index"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Artificial Analysis
                  </a>{' '}
                  currently describes GLM-5.2 as the new leading open-weights
                  model on its Intelligence Index. In the benchmark snapshot
                  below, GLM-5.2 scores 51 on the index, while Claude Opus 4.8
                  sits at 56. The cost-per-intelligence view places GLM-5.2 much
                  lower on cost at the same time.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div className="not-prose mt-8">
                <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-surface-2">
                  {/* biome-ignore lint/performance/noImgElement: static benchmark asset */}
                  <img
                    src="/use-cases/glm/artificial-analysis-glm-5-2.png"
                    alt="Artificial Analysis charts showing GLM-5.2 near Claude Opus 4.8 on intelligence, while positioned at a lower cost per task"
                    className="block h-auto w-full bg-surface-1"
                  />
                </div>
                <p className="mt-3 text-center text-muted-foreground text-sm">
                  Benchmark charts from{' '}
                  <a
                    href="https://artificialanalysis.ai/articles/glm-5-2-is-the-new-leading-open-weights-model-on-the-artificial-analysis-intelligence-index"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Artificial Analysis
                  </a>
                  . GLM-5.2 is shown close to Claude Opus 4.8 on intelligence,
                  while sitting in a cheaper part of the cost curve.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* What is stagewise */}
      <section className="relative z-10 w-full py-6 md:py-8">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <p>
                  stagewise is a local IDE for software engineers who work with
                  coding agents. It runs on your machine, connects to your
                  development environment, and can orchestrate multiple agents
                  in parallel. The runtime is model-agnostic, so you can use
                  frontier models, open-weight models, or local inference. It
                  also manages context aggressively, which matters once a task
                  starts stretching across many turns.{' '}
                  <Link
                    href="/"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Learn more about stagewise
                  </Link>
                  .
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Efficiency through input caching */}
      <section className="relative z-10 w-full py-6 md:py-8">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Keeping long-running GLM tasks practical
                </h2>
                <p>
                  GLM 5.2 is strong enough that the bottleneck quickly becomes
                  runtime efficiency rather than raw model quality. Once a task
                  runs for dozens of turns, this is where the agent matters.
                </p>
                <p>
                  Our agent keeps the early part of the conversation{' '}
                  <strong>stable across multiple turns</strong>, so the prefix
                  stays the same from one request to the next. That improves
                  cache hit rates and often lowers both latency and cost.
                </p>
                <p>
                  Also, when the environment changes (files were changed, skills
                  were enabled/disabled, etc.), the system does not resend the
                  full context. If you rename a file, open a tab, or move a
                  selection, it appends a compact <strong>state delta</strong>{' '}
                  to the model context instead of rebuilding everything. The
                  model still gets an up-to-date view of the workspace, but with
                  way fewer tokens.
                </p>
                <p>
                  The runtime also automatically{' '}
                  <strong>compresses context</strong> as tasks grow. Older turns
                  are summarized and pruned so the model keeps a focused working
                  set. That makes longer jobs practical: multi-file features,
                  refactors that unfold over hours, or debugging sessions for
                  tricky issues.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* GLM 5.2 — your way */}
      <section className="relative z-10 w-full py-6 md:py-8">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Use GLM through our hosted setup, your own endpoint, or local
                  inference
                </h2>
                <p>
                  You can use GLM 5.2 through a stagewise Account and start
                  without managing a separate API key.
                </p>
                <p>
                  If you already have GLM access elsewhere, you can point the
                  IDE at that setup instead. Existing API subscriptions,
                  third-party endpoints, and <strong>local inference</strong>{' '}
                  all work with the same runtime. See the{' '}
                  <a
                    href="https://docs.stagewise.io/reference/custom-providers"
                    target="_blank"
                    rel="noreferrer"
                  >
                    custom providers docs
                  </a>{' '}
                  for the setup details.
                </p>
                <p>
                  We think agent tools should not dictate where you buy
                  inference. You choose the billing and hosting model that fits
                  your setup.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Working with images */}
      <section className="relative z-10 w-full py-6 md:py-8">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Working with image files despite GLM's lack of vision
                </h2>
                <p>
                  One major drawback of the current GLM models is that they do
                  not have native vision capabilities. They cannot inspect image
                  contents directly. In a real codebase, that is a meaningful
                  limitation because screenshots, exported assets, and design
                  files are still part of the workspace.
                </p>
                <p>
                  The stagewise agent compensates for that limitation. Our file
                  transformation pipeline turns each image into structured file
                  context the model can reason about in text: file type,
                  dimensions, format, and a compact representation of the image.
                  That keeps image files inside the same workflow as source
                  files and config.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div className="not-prose mt-8">
                <div
                  className="relative w-full overflow-hidden rounded-lg ring-1 ring-surface-2"
                  style={{ aspectRatio: '16 / 9' }}
                >
                  {/* biome-ignore lint/performance/noImgElement: static news asset */}
                  <img
                    src="/news/file-pipeline-overview.png"
                    alt="File transformation pipeline: files go in, typed content parts come out"
                    className="absolute inset-0 h-full w-full bg-surface-1 object-contain"
                  />
                </div>
                <p className="mt-3 text-center text-muted-foreground text-sm">
                  The file transformation pipeline turns files into structured
                  content parts.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <div className="not-prose mt-12">
                <div
                  className="relative w-full overflow-hidden rounded-lg ring-1 ring-surface-2"
                  style={{ aspectRatio: '16 / 9' }}
                >
                  {/* biome-ignore lint/performance/noImgElement: static news asset */}
                  <img
                    src="/news/file-pipeline-image-transform.png"
                    alt="Transformation pipeline: a RAW file becomes metadata and a downscaled representation"
                    className="absolute inset-0 h-full w-full bg-surface-1 object-contain"
                  />
                </div>
                <p className="mt-3 text-center text-muted-foreground text-sm">
                  Image files are transformed into structured metadata and a
                  compact representation. GLM only operates on that metadata
                  layer.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="prose dark:prose-invert prose-p:my-0 mt-12 max-w-none">
                <p>
                  This does not give GLM vision. It does give the model enough
                  context to work sensibly with image files in a repository —
                  for example when updating references, resizing assets, or
                  understanding the layout of a design directory.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="relative z-10 w-full py-24 md:py-32">
        <div className="flex justify-center">
          <ScrollReveal>
            <div className="w-full max-w-4xl px-4 pt-8 text-center">
              <h2 className="mb-8 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="text-foreground">
                  An Open-Source IDE Built for GLM
                </span>
              </h2>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <DownloadButtons className="w-full sm:w-auto" />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
