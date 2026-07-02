import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { DownloadButtons } from '../../_components/download-buttons';
import { HeroImage } from './hero-image';
import { UseCaseFAQ } from '../_components/use-case-faq';

export const metadata: Metadata = {
  title: 'An Open-Source IDE with First-Class DeepSeek Support · stagewise',
  description:
    'stagewise is an open-source IDE for coding agents with first-class support for DeepSeek V4 Pro and V4 Flash. Run via stagewise Cloud Inference, your own API key, or local inference with Ollama — no lock-in.',
  openGraph: {
    title: 'An Open-Source IDE with First-Class DeepSeek Support · stagewise',
    description:
      'stagewise is an open-source IDE for coding agents with first-class support for DeepSeek V4 Pro and V4 Flash. Run via stagewise Cloud Inference, your own API key, or local inference with Ollama — no lock-in.',
    type: 'website',
  },
  twitter: {
    title: 'An Open-Source IDE with First-Class DeepSeek Support · stagewise',
    description:
      'stagewise is an open-source IDE for coding agents with first-class support for DeepSeek V4 Pro and V4 Flash. Run via stagewise Cloud Inference, your own API key, or local inference with Ollama — no lock-in.',
    creator: '@stagewise_io',
  },
  alternates: {
    canonical: 'https://stagewise.io/use-cases/deepseek',
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
      name: 'DeepSeek',
      item: 'https://stagewise.io/use-cases/deepseek',
    },
  ],
};

export default function DeepSeekUseCasePage() {
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
                  DeepSeek
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
                  if the model itself is not capable of actually <i>seeing</i>{' '}
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

      {/* FAQs */}
      <UseCaseFAQ
        items={[
          {
            question: 'How can I use DeepSeek in stagewise?',
            plainTextAnswer:
              'You can run DeepSeek in stagewise using three options: 1. stagewise Cloud Inference: With a stagewise Account, you get preconfigured access to a wide variety of models including DeepSeek V4 Pro and V4 Flash — no keys, configuration, or external subscriptions required. 2. Your API Key: Supply a DeepSeek API key, or use an API aggregator (like OpenRouter or fireworks.ai) to route your queries. 3. Custom Endpoint: Connect stagewise to any custom endpoint — including local servers (Ollama, Llama.cpp), on-premise deployments (vLLM), or enterprise inference providers.',
            answer: (
              <>
                <p>You can run DeepSeek in stagewise using three options:</p>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  <li>
                    <strong>stagewise Cloud Inference:</strong> With a stagewise
                    Account, you get preconfigured access to a wide variety of
                    models including DeepSeek V4 Pro and V4 Flash — no keys,
                    configuration, or external subscriptions <em>required</em>.
                  </li>
                  <li>
                    <strong>Your API Key:</strong> Supply a DeepSeek API key, or
                    use an API aggregator (like OpenRouter or fireworks.ai) to
                    route your queries.
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
            question: 'What DeepSeek models are supported?',
            plainTextAnswer:
              'The models listed on our home page — DeepSeek V4 Pro and DeepSeek V4 Flash — are available out of the box. Beyond those, you can connect any additional DeepSeek model that has agentic capabilities through your own API key or inference provider.',
            answer: (
              <>
                <p>
                  The models listed on our home page —{' '}
                  <strong>DeepSeek V4 Pro</strong> and{' '}
                  <strong>DeepSeek V4 Flash</strong> — are available{' '}
                  <em>out of the box</em>. Beyond those, you can connect any
                  additional DeepSeek model that has agentic capabilities
                  through your own API key or inference provider.
                </p>
              </>
            ),
          },
          {
            question:
              'Can we use fine-tuned or quantized variants of DeepSeek models with stagewise?',
            plainTextAnswer:
              'Yes. You can connect models from any model provider API, including your custom model variants — whether fine-tuned, quantized, or otherwise specialized.',
            answer: (
              <>
                <p>
                  Yes. You can connect models from <em>any</em> model provider
                  API, including your custom model variants — whether{' '}
                  <strong>fine-tuned</strong>, <strong>quantized</strong>, or
                  otherwise specialized.
                </p>
              </>
            ),
          },
          {
            question: 'Can we use a locally hosted DeepSeek model?',
            plainTextAnswer:
              'Yes. You can configure stagewise Agents to use models from any source, including a local setup using Ollama or an on-premise deployment in your own datacenter with setups like vLLM. We support any inference provider option that serves models via one of the popular model access APIs like OpenAI Chat Completions API, OpenResponses API, or Anthropic Messages API. The minimum recommended context size is 150k tokens.',
            answer: (
              <>
                <p>
                  Yes. You can configure stagewise Agents to use models from{' '}
                  <em>any</em> source, including a local setup using Ollama or
                  an on-premise deployment in your own datacenter with setups
                  like vLLM.
                </p>
                <p>
                  We support any inference provider option that serves models
                  via one of the popular model access APIs like OpenAI Chat
                  Completions API, OpenResponses API, or Anthropic Messages API.
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
              'Can we connect our enterprise inference provider to use DeepSeek models?',
            plainTextAnswer:
              'Yes. stagewise offers the option to connect Azure Foundry, AWS Bedrock, and Google Vertex endpoints for enterprise-grade inference.',
            answer: (
              <>
                <p>
                  Yes. stagewise offers the option to connect{' '}
                  <strong>Azure Foundry</strong>, <strong>AWS Bedrock</strong>,
                  and <strong>Google Vertex</strong> endpoints for
                  enterprise-grade inference.
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
