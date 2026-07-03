import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { DownloadButtons } from '../../_components/download-buttons';
import { HeroImage } from './hero-image';
import { UseCaseFAQ } from '../_components/use-case-faq';

export const metadata: Metadata = {
  title:
    'An Open-Source IDE & Coding Agent with First-Class GLM Support · stagewise',
  description:
    'stagewise is an open-source IDE and coding agent with first-class support for GLM 5.2, 5.1, and 5V-Turbo from Z.AI. Run via stagewise Cloud Inference, your own Z.AI API key, or local inference. Near-Claude Opus 4.8 quality at a fraction of the cost.',
  openGraph: {
    title:
      'An Open-Source IDE & Coding Agent with First-Class GLM Support · stagewise',
    description:
      'stagewise is an open-source IDE and coding agent with first-class support for GLM 5.2, 5.1, and 5V-Turbo from Z.AI. Run via stagewise Cloud Inference, your own Z.AI API key, or local inference. Near-Claude Opus 4.8 quality at a fraction of the cost.',
    type: 'website',
  },
  twitter: {
    title:
      'An Open-Source IDE & Coding Agent with First-Class GLM Support · stagewise',
    description:
      'stagewise is an open-source IDE and coding agent with first-class support for GLM 5.2, 5.1, and 5V-Turbo from Z.AI. Run via stagewise Cloud Inference, your own Z.AI API key, or local inference. Near-Claude Opus 4.8 quality at a fraction of the cost.',
    creator: '@stagewise_io',
  },
  alternates: {
    canonical: 'https://stagewise.io/use-cases/glm',
  },
  robots: { index: true, follow: true },
  category: 'technology',
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://stagewise.io/',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'GLM',
      item: 'https://stagewise.io/use-cases/glm',
    },
  ],
};

export default function GLMUseCasePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Breadcrumb */}
      <div className="relative z-10 mt-8 w-full">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center gap-2 text-muted-foreground text-sm">
                <li>
                  <Link
                    href="/"
                    className="transition-colors hover:text-foreground"
                  >
                    Home
                  </Link>
                </li>
                <li
                  aria-current="page"
                  className="text-foreground before:mr-2 before:text-muted-foreground before:content-['/']"
                >
                  GLM
                </li>
              </ol>
            </nav>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative z-10 mt-6 w-full pb-4 md:pb-6">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl">
            <ScrollReveal>
              <div className="mt-0 mb-6 flex flex-col items-start px-4 text-left md:mt-2 md:mb-8">
                <h1 className="mb-4 font-medium text-3xl tracking-tight md:text-5xl">
                  <span className="text-foreground">
                    An Open-Source IDE and Coding Agent Built for GLM
                  </span>
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  GLM 5.2 is compelling for a simple reason: it gets unusually
                  close to Claude Opus 4.8 in quality while sitting at a much
                  lower cost point. stagewise gives it a local IDE with a
                  capable coding agent built for long-running work.
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
      <section className="relative z-10 w-full py-3 md:py-4">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <p>
                  stagewise is a local IDE that ships with its own coding agent.
                  It runs on your machine, connects to your development
                  environment, and can orchestrate multiple agents in parallel.
                  The runtime is model-agnostic, so you can use frontier models,
                  open-weight models, or local inference. It also manages
                  context aggressively, which matters once a task starts
                  stretching across many turns.{' '}
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

      {/* Why GLM 5.2 stands out */}
      <section className="relative z-10 w-full py-3 md:py-4">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Why GLM 5.2 stands out right now
                </h2>
                <p>
                  The release of GLM 5.2 sent shocks through the world of AI,
                  because it showed that open-source models suddenly play at the
                  very frontier of AI. With performance that's in many ways
                  comparable to models like Claude Opus 4.8, but at a fraction
                  of the cost and the capability to host the model wherever you
                  want, the playing field for AI models changes significantly.
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

      {/* Efficiency through input caching */}
      <section className="relative z-10 w-full py-3 md:py-4">
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
                  The stagewise agent keeps the early part of the conversation{' '}
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
      <section className="relative z-10 w-full py-3 md:py-4">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Use GLM through a stagewise Account, your own endpoint, or
                  local inference
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
                  stagewise does not dictate where you buy inference. You choose
                  the billing and hosting model that fits your setup.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Working with images */}
      <section className="relative z-10 w-full py-3 md:py-4">
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
                  The stagewise agent compensates for that limitation. The
                  stagewise file transformation pipeline turns each image into
                  structured file context the model can reason about in text:
                  file type, dimensions, format, and a compact representation of
                  the image. That keeps image files inside the same workflow as
                  source files and config.
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
              <div className="prose dark:prose-invert prose-p:my-0 mt-8 max-w-none">
                <p>
                  To be completely clear: GLM models don&apos;t natively support
                  vision and thus, making the model <em>see</em> the image is
                  not possible. But even with GLM models, stagewise agents are
                  able to understand the role of the image, its format, its file
                  size, and a lot of the other things that are required to
                  operate with images in the software engineering context. If
                  your workflow requires actual visual reasoning,{' '}
                  <Link
                    href="/use-cases/minimax"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    MiniMax M3
                  </Link>{' '}
                  offers native vision capabilities.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <UseCaseFAQ
        items={[
          {
            question:
              'Is stagewise just an IDE, or does it come with its own coding agent?',
            plainTextAnswer:
              'Both. stagewise is a coding agent orchestrator: it ships its own first-class, model-independent agent harness — the runtime that handles tooling, context management, file access, and multi-agent orchestration — alongside the user interface you use to control that harness. The harness is model-agnostic, so it works with any capable model, including GLM. You get the IDE and the agent in one product.',
            answer: (
              <>
                <p>
                  Both. stagewise is a coding agent orchestrator: it ships its
                  own{' '}
                  <strong>first-class, model-independent agent harness</strong>{' '}
                  — the runtime that handles tooling, context management, file
                  access, and multi-agent orchestration — alongside the{' '}
                  <strong>user interface</strong> you use to control that
                  harness.
                </p>
                <p>
                  The harness is model-agnostic, so it works with any capable
                  model, including GLM. You get the IDE and the agent in one
                  product.
                </p>
              </>
            ),
          },
          {
            question: 'How can I use GLM in stagewise?',
            plainTextAnswer:
              'You can run GLM in stagewise using three options: 1. stagewise Cloud Inference: With a stagewise Account, you get preconfigured access to a wide variety of models including GLM 5.2, GLM 5.1, and GLM 5V-Turbo — no keys, configuration, or external subscriptions required. 2. Your API Key: Supply your own Z.AI API key, or use an API aggregator (like OpenRouter or fireworks.ai) to route your queries. 3. Custom Endpoint: Connect stagewise to any custom endpoint — including local servers (Ollama, Llama.cpp), on-premise deployments (vLLM), or enterprise inference providers.',
            answer: (
              <>
                <p>You can run GLM in stagewise using three options:</p>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  <li>
                    <Link
                      href="/pricing"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      <strong>stagewise Cloud Inference</strong>
                    </Link>
                    : With a stagewise Account, you get preconfigured access to
                    a wide variety of models including GLM 5.2, GLM 5.1, and GLM
                    5V-Turbo — no keys, configuration, or external subscriptions{' '}
                    <em>required</em>.
                  </li>
                  <li>
                    <strong>Your API Key:</strong> Supply your own Z.AI API key,
                    or use an API aggregator (like OpenRouter or fireworks.ai)
                    to route your queries.
                  </li>
                  <li>
                    <strong>Custom Endpoint:</strong> Connect stagewise to{' '}
                    <em>any</em> custom endpoint — including local servers
                    (Ollama, Llama.cpp), on-premise deployments (vLLM), or
                    enterprise inference providers.
                  </li>
                </ul>
              </>
            ),
          },
          {
            question: 'What GLM models are supported?',
            plainTextAnswer:
              'The models listed on the stagewise home page — GLM 5.2, GLM 5.1, and GLM 5V-Turbo — are available out of the box. Beyond those, you can connect any additional GLM model that has agentic capabilities through your own API key or inference provider.',
            answer: (
              <>
                <p>
                  The models listed on the stagewise home page —{' '}
                  <strong>GLM 5.2</strong>,<strong>GLM 5.1</strong>, and{' '}
                  <strong>GLM 5V-Turbo</strong> — are available{' '}
                  <em>out of the box</em>. Beyond those, you can connect any
                  additional GLM model that has agentic capabilities through
                  your own API key or inference provider.
                </p>
              </>
            ),
          },
          {
            question: 'Can I use my GLM coding plan with stagewise?',
            plainTextAnswer:
              "Yes, but at your own risk. While stagewise supports using the GLM coding plan, stagewise is not an official partner of Z.AI's coding plan program and cannot guarantee that your access to GLM models through the coding plan API key complies with Z.AI's terms.",
            answer: (
              <>
                <p>
                  Yes, but <strong>at your own risk</strong>. While stagewise
                  supports using the GLM coding plan, stagewise is{' '}
                  <em>not an official partner</em> of Z.AI&apos;s coding plan
                  program.
                </p>
                <p>
                  stagewise cannot guarantee that your access to GLM models
                  through the coding plan API key complies with Z.AI&apos;s
                  terms.
                </p>
              </>
            ),
          },
          {
            question:
              'Can I use fine-tuned or quantized variants of GLM models with stagewise?',
            plainTextAnswer:
              'Yes. You can connect models from any model provider API, including your custom model variants — whether fine-tuned, quantized, or otherwise specialized. See the custom models docs for details.',
            answer: (
              <>
                <p>
                  Yes. You can connect models from <em>any</em> model provider
                  API, including your custom model variants — whether{' '}
                  <strong>fine-tuned</strong>, <strong>quantized</strong>, or
                  otherwise specialized. See the{' '}
                  <a
                    href="https://docs.stagewise.io/reference/custom-models"
                    target="_blank"
                    rel="noreferrer"
                  >
                    custom models docs
                  </a>{' '}
                  for details.
                </p>
              </>
            ),
          },
          {
            question: 'Can I use a locally hosted GLM model?',
            plainTextAnswer:
              'Yes. You can configure stagewise Agents to use models from any source, including a local setup using Ollama or an on-premise deployment in your own datacenter with setups like vLLM. stagewise supports any inference provider option that serves models via one of the popular model access APIs like OpenAI Chat Completions API, OpenResponses API, or Anthropic Messages API. The minimum recommended context size is 150k tokens.',
            answer: (
              <>
                <p>
                  Yes. You can configure stagewise Agents to use models from{' '}
                  <em>any</em> source, including a local setup using Ollama or
                  an on-premise deployment in your own datacenter with setups
                  like vLLM.
                </p>
                <p>
                  stagewise supports any inference provider option that serves
                  models via one of the popular model access APIs like OpenAI
                  Chat Completions API, OpenResponses API, or Anthropic Messages
                  API.
                </p>
                <p>
                  The minimum recommended context size is{' '}
                  <strong>150k tokens</strong>.
                </p>
              </>
            ),
          },
          {
            question:
              'Can I connect an enterprise inference provider to use GLM models?',
            plainTextAnswer:
              'Yes. stagewise offers the option to connect Azure Foundry, AWS Bedrock, and Google Vertex endpoints for enterprise-grade inference. See the stagewise enterprise page for more.',
            answer: (
              <>
                <p>
                  Yes. stagewise offers the option to connect{' '}
                  <strong>Azure Foundry</strong>, <strong>AWS Bedrock</strong>,
                  and <strong>Google Vertex</strong> endpoints for
                  enterprise-grade inference. See the{' '}
                  <Link
                    href="/enterprise"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    enterprise page
                  </Link>{' '}
                  for more.
                </p>
              </>
            ),
          },
        ]}
      />

      {/* Footer CTA */}
      <section className="relative z-10 w-full py-24 md:py-32">
        <div className="flex justify-center">
          <ScrollReveal>
            <div className="w-full max-w-4xl px-4 pt-8 text-center">
              <h2 className="mb-8 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="text-foreground">
                  An Open-Source IDE and Coding Agent Built for GLM
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
