import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { DownloadButtons } from '../../_components/home-client';
import { HeroImage } from './hero-image';

export const metadata: Metadata = {
  title: 'An Open-Source IDE Built for DeepSeek · stagewise',
  description:
    'Run DeepSeek V4 Flash and V4 Pro in stagewise with a stagewise Account, your own API setup, or local inference. Built for long-running coding tasks.',
  openGraph: {
    title: 'An Open-Source IDE Built for DeepSeek · stagewise',
    description:
      'Run DeepSeek V4 Flash and V4 Pro in stagewise with a stagewise Account, your own API setup, or local inference. Built for long-running coding tasks.',
    type: 'website',
  },
  twitter: {
    title: 'An Open-Source IDE Built for DeepSeek · stagewise',
    description:
      'Run DeepSeek V4 Flash and V4 Pro in stagewise with a stagewise Account, your own API setup, or local inference. Built for long-running coding tasks.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function DeepSeekUseCasePage() {
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
                    An Open-Source IDE Built for DeepSeek
                  </span>
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Use DeepSeek V4 Flash and V4 Pro in a local IDE built for
                  long-running agent work. Run it through a stagewise Account,
                  your own API setup, or local inference.
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
                  Keeping long-running DeepSeek tasks practical
                </h2>
                <p>
                  DeepSeek is already inexpensive, but token efficiency still
                  determines what is practical once a task runs for dozens of
                  turns. This is where the agent matters.
                </p>
                <p>
                  Our agent keeps the early part of the conversation{' '}
                  <strong>stable across multiple turns</strong>, so the prefix
                  stays the same from one request to the next. That improves
                  cache hit rates on DeepSeek&apos;s infrastructure and often
                  lowers both latency and cost.
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
                  <strong>compresses context</strong>
                  as tasks grow. Older turns are summarized and pruned so the
                  model keeps a focused working set. That makes longer jobs
                  practical: multi-file features, refactors that unfold over
                  hours, or debugging sessions for tricky issues.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* DeepSeek V4 Flash and V4 Pro — your way */}
      <section className="relative z-10 w-full py-6 md:py-8">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Use DeepSeek through our hosted setup, your own endpoint, or
                  local inference
                </h2>
                <p>
                  You can use DeepSeek V4 Flash and V4 Pro through a stagewise
                  Account and start without managing a separate API key.
                </p>
                <p>
                  If you already have DeepSeek access elsewhere, you can point
                  the IDE at that setup instead. Existing API subscriptions,
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

      {/* Working with images — even without vision */}
      <section className="relative z-10 w-full py-6 md:py-8">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Working with image files without native vision
                </h2>
                <p>
                  DeepSeek models do not have native vision capabilities, so
                  they cannot inspect image contents directly. Other harnesses
                  thus often fail in giving the user a coherent and functional
                  experience once image-type files get involved, because image
                  handling is outsourced to the model API.
                </p>
                <p>
                  The stagewise agent however takes a different approach: Our
                  file transformation pipeline turns each image into structured
                  file context the model can reason about in text: file type,
                  dimensions, format, and a compact representation of the image.
                  That keeps image files inside the same workflow as source
                  files and config and makes them accessible to the agent, even
                  if the model itself is nopt capable of actually <i>seeing</i>{' '}
                  images.
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
                  compact representation. DeepSeek only operates on the metadata
                  layer.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="prose dark:prose-invert prose-p:my-0 mt-12 max-w-none">
                <p>
                  This does not give DeepSeek vision, but: It does give the
                  model enough context to work sensibly with image files in a
                  repository — for example when updating references, resizing
                  assets, or understanding the layout of a design directory.
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
                  An Open-Source IDE Built for DeepSeek
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
