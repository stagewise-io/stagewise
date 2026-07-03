import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { DownloadButtons } from '../../_components/download-buttons';
import { HeroImage } from './hero-image';
import { UseCaseFAQ } from '../_components/use-case-faq';

export const metadata: Metadata = {
  title:
    'An Open-Source IDE & Coding Agent with First-Class MiniMax Support · stagewise',
  description:
    'stagewise is an open-source IDE and coding agent with first-class support for MiniMax M3, M2.7, and M2. MiniMax M3 is state of the art among open-weight models with native vision, with precise instruction following and a low hallucination rate. Run via stagewise Cloud Inference, the MiniMax Token Plan, your own API key, or local inference.',
  openGraph: {
    title:
      'An Open-Source IDE & Coding Agent with First-Class MiniMax Support · stagewise',
    description:
      'stagewise is an open-source IDE and coding agent with first-class support for MiniMax M3, M2.7, and M2. MiniMax M3 is state of the art among open-weight models with native vision, with precise instruction following and a low hallucination rate. Run via stagewise Cloud Inference, the MiniMax Token Plan, your own API key, or local inference.',
    type: 'website',
  },
  twitter: {
    title:
      'An Open-Source IDE & Coding Agent with First-Class MiniMax Support · stagewise',
    description:
      'stagewise is an open-source IDE and coding agent with first-class support for MiniMax M3, M2.7, and M2. MiniMax M3 is state of the art among open-weight models with native vision, with precise instruction following and a low hallucination rate. Run via stagewise Cloud Inference, the MiniMax Token Plan, your own API key, or local inference.',
    creator: '@stagewise_io',
  },
  alternates: {
    canonical: 'https://stagewise.io/use-cases/minimax',
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
      name: 'MiniMax',
      item: 'https://stagewise.io/use-cases/minimax',
    },
  ],
};

export default function MiniMaxUseCasePage() {
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
                  MiniMax
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
                    An Open-Source IDE and Coding Agent Built for MiniMax
                  </span>
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  MiniMax M3 is state of the art among open-weight models with
                  native vision, combining precise instruction following with a
                  low hallucination rate. stagewise gives it a local IDE with a
                  coding agent built for long-running work.
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

      {/* Why MiniMax M3 stands out */}
      <section className="relative z-10 w-full py-3 md:py-4">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Why MiniMax M3 stands out right now
                </h2>
                <p>
                  MiniMax M3 does not top the benchmarks on raw intelligence,
                  and it does not need to. It handles the daily coding tasks
                  that make up most real work. It stands out in the properties
                  that matter for agentic use.
                </p>
                <h3 className="font-medium text-foreground text-lg">
                  State of the art among open-weight models with vision
                </h3>
                <p>
                  MiniMax M3 is state of the art among open-weight models with
                  native vision, which makes it well suited for frontend
                  development and other graphics-related work. On the{' '}
                  <a
                    href="https://artificialanalysis.ai/evaluations/mmmu-pro#mmmu-pro-score"
                    target="_blank"
                    rel="noreferrer"
                  >
                    MMMU-Pro benchmark
                  </a>
                  , its visual reasoning is competitive with top-tier models at
                  a lower cost than frontier models with vision.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div className="not-prose mt-8">
                <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-surface-2">
                  {/* biome-ignore lint/performance/noImgElement: static benchmark asset */}
                  <img
                    src="/use-cases/minimax/mmmu-pro.png"
                    alt="MMMU-Pro benchmark showing visual reasoning scores across models"
                    className="block h-auto w-full bg-surface-1"
                  />
                </div>
                <p className="mt-3 text-center text-muted-foreground text-sm">
                  MMMU-Pro visual reasoning benchmark, via{' '}
                  <a
                    href="https://artificialanalysis.ai/evaluations/mmmu-pro#mmmu-pro-score"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Artificial Analysis
                  </a>
                  .
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <div className="prose dark:prose-invert prose-p:my-0 mt-8 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h3 className="font-medium text-foreground text-lg">
                  Strong instruction following, low hallucination
                </h3>
                <p>
                  Instruction following and hallucination rate determine whether
                  a model is reliable on long-running tasks. On the{' '}
                  <a
                    href="https://artificialanalysis.ai/evaluations/ifbench#ifbench-score"
                    target="_blank"
                    rel="noreferrer"
                  >
                    IFBench
                  </a>
                  , MiniMax M3 scores high on instruction following. On the{' '}
                  <a
                    href="https://artificialanalysis.ai/evaluations/omniscience#omniscience-hallucination-rate-tabs"
                    target="_blank"
                    rel="noreferrer"
                  >
                    AA-Omniscience
                  </a>{' '}
                  benchmark, it has a low hallucination rate. Both matter when a
                  task runs for dozens of turns and the model needs to stay
                  reliable.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="not-prose mt-8">
                <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-surface-2">
                  {/* biome-ignore lint/performance/noImgElement: static benchmark asset */}
                  <img
                    src="/use-cases/minimax/ifbench.png"
                    alt="IFBench benchmark showing instruction following scores across models"
                    className="block h-auto w-full bg-surface-1"
                  />
                </div>
                <p className="mt-3 text-center text-muted-foreground text-sm">
                  IFBench instruction following benchmark, via{' '}
                  <a
                    href="https://artificialanalysis.ai/evaluations/ifbench#ifbench-score"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Artificial Analysis
                  </a>
                  .
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={400}>
              <div className="not-prose mt-8">
                <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-surface-2">
                  {/* biome-ignore lint/performance/noImgElement: static benchmark asset */}
                  <img
                    src="/use-cases/minimax/aa-omniscience.png"
                    alt="AA-Omniscience benchmark showing hallucination rates across models"
                    className="block h-auto w-full bg-surface-1"
                  />
                </div>
                <p className="mt-3 text-center text-muted-foreground text-sm">
                  AA-Omniscience hallucination benchmark, via{' '}
                  <a
                    href="https://artificialanalysis.ai/evaluations/omniscience#omniscience-hallucination-rate-tabs"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Artificial Analysis
                  </a>
                  .
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
                  Keeping long-running MiniMax tasks practical
                </h2>
                <p>
                  MiniMax M3 is strong enough that the bottleneck quickly
                  becomes runtime efficiency rather than raw model quality. Once
                  a task runs for dozens of turns, the agent runtime is what
                  keeps things working.
                </p>
                <p>
                  The stagewise agent keeps the early part of the conversation{' '}
                  <strong>stable across multiple turns</strong>, so the prefix
                  stays the same from one request to the next. That improves
                  cache hit rates and often lowers both latency and cost.
                </p>
                <p>
                  When the environment changes (files were changed, skills were
                  enabled/disabled, etc.), the system does not resend the full
                  context. If you rename a file, open a tab, or move a
                  selection, it appends a compact <strong>state delta</strong>{' '}
                  to the model context instead of rebuilding everything. The
                  model still gets an up-to-date view of the workspace, but with
                  far fewer tokens.
                </p>
                <p>
                  The runtime also automatically{' '}
                  <strong>compresses context</strong> as tasks grow. Older turns
                  are summarized and pruned so the model keeps a focused working
                  set. That makes longer jobs feasible: multi-file features,
                  refactors that unfold over hours, or debugging sessions for
                  tricky issues.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* MiniMax M3 — your way */}
      <section className="relative z-10 w-full py-3 md:py-4">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Use MiniMax through a stagewise Account, the MiniMax Token
                  Plan, or local inference
                </h2>
                <p>
                  The default{' '}
                  <Link
                    href="/pricing"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    <strong>stagewise Cloud Inference</strong>
                  </Link>{' '}
                  is the easiest way to get started: with a stagewise Account,
                  you get preconfigured access to MiniMax models alongside a
                  wide range of other models, all without managing a separate
                  API key.
                </p>
                <p>
                  If you want to get the most out of MiniMax specifically, the{' '}
                  <a
                    href="https://platform.minimax.io/subscribe/token-plan"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <strong>MiniMax Token Plan</strong>
                  </a>{' '}
                  is the recommended option. You can set it up during
                  onboarding, or later in the settings.
                </p>
                <p>
                  If you already have MiniMax access elsewhere, you can point
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
                  stagewise does not dictate where you buy inference. You choose
                  the billing and hosting model that fits your setup.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Native vision meets agentic workflows */}
      <section className="relative z-10 w-full py-3 md:py-4">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Native vision meets agentic workflows
                </h2>
                <p>
                  Unlike GLM or DeepSeek, MiniMax M3 has native vision
                  capabilities. It can see and reason about images, screenshots,
                  and design files — no workarounds needed. That makes it a
                  natural fit for frontend work, UI debugging, and any task
                  where the model needs to understand what something looks like,
                  not just what the code says.
                </p>
                <p>
                  With stagewise, this becomes practical. stagewise agents can
                  take screenshots of the website you are working on, send them
                  to MiniMax M3, and the model can <em>see</em> what is on
                  screen. The agent can then check visual output, improve
                  designs, and resolve issues that require vision access —
                  without you having to describe what you see.
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
              'Both. stagewise is a coding agent orchestrator: it ships its own first-class, model-independent agent harness — the runtime that handles tooling, context management, file access, and multi-agent orchestration — alongside the user interface you use to control that harness. The harness is model-agnostic, so it works with any capable model, including MiniMax. You get the IDE and the agent in one product.',
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
                  model, including MiniMax. You get the IDE and the agent in one
                  product.
                </p>
              </>
            ),
          },
          {
            question: 'How can I use MiniMax in stagewise?',
            plainTextAnswer:
              'You can run MiniMax in stagewise using three options: 1. stagewise Cloud Inference: With a stagewise Account, you get preconfigured access to a wide variety of models including MiniMax M3, MiniMax M2.7, and MiniMax M2 — no keys, configuration, or external subscriptions required. 2. Your API Key: Supply your own MiniMax API key, or use an API aggregator (like OpenRouter or fireworks.ai) to route your queries. 3. Custom Endpoint: Connect stagewise to any custom endpoint — including local servers (Ollama, Llama.cpp), on-premise deployments (vLLM), or enterprise inference providers.',
            answer: (
              <>
                <p>You can run MiniMax in stagewise using three options:</p>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  <li>
                    <Link
                      href="/pricing"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      <strong>stagewise Cloud Inference</strong>
                    </Link>
                    : With a stagewise Account, you get preconfigured access to
                    a wide variety of models including MiniMax M3, MiniMax M2.7,
                    and MiniMax M2 — no keys, configuration, or external
                    subscriptions <em>required</em>.
                  </li>
                  <li>
                    <strong>Your API Key:</strong> Supply your own MiniMax API
                    key, or use an API aggregator (like OpenRouter or
                    fireworks.ai) to route your queries.
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
            question: 'What MiniMax models are supported?',
            plainTextAnswer:
              'The models listed on the stagewise home page — MiniMax M3, MiniMax M2.7, and MiniMax M2 — are available out of the box. Beyond those, you can connect any additional MiniMax model that has agentic capabilities through your own API key or inference provider.',
            answer: (
              <>
                <p>
                  The models listed on the stagewise home page —{' '}
                  <strong>MiniMax M3</strong>, <strong>MiniMax M2.7</strong>,
                  and <strong>MiniMax M2</strong> — are available{' '}
                  <em>out of the box</em>. Beyond those, you can connect any
                  additional MiniMax model that has agentic capabilities through
                  your own API key or inference provider.
                </p>
              </>
            ),
          },
          {
            question: 'Can I use my MiniMax Token Plan with stagewise?',
            plainTextAnswer:
              'Yes. The MiniMax Token Plan is fully supported and is the best way to get the most out of MiniMax models. You can set it up during onboarding, or later in the settings at any time. You can also switch between providers whenever you like — stagewise Cloud Inference, the MiniMax Token Plan, your own API key, or local inference — without losing your work or configuration.',
            answer: (
              <>
                <p>
                  Yes. The MiniMax Token Plan is fully supported and is the best
                  way to use MiniMax models effectively.
                </p>
                <p>
                  You can set it up during <strong>onboarding</strong>, or later
                  in the <strong>settings</strong> at any time.
                </p>
                <p>
                  You can also <strong>switch between providers</strong>{' '}
                  whenever you like — stagewise Cloud Inference, the MiniMax
                  Token Plan, your own API key, or local inference — without
                  losing your work or configuration.
                </p>
              </>
            ),
          },
          {
            question:
              'Can I use fine-tuned or quantized variants of MiniMax models with stagewise?',
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
            question: 'Can I use a locally hosted MiniMax model?',
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
              'Can I connect an enterprise inference provider to use MiniMax models?',
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
                  An Open-Source IDE and Coding Agent Built for MiniMax
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
