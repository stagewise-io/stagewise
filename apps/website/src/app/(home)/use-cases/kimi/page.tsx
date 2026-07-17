import type { Metadata } from 'next';
import Link from 'next/link';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { DownloadButtons } from '../../_components/download-buttons';
import { HeroImage } from './hero-image';
import { UseCaseFAQ } from '../_components/use-case-faq';

export const metadata: Metadata = {
  title:
    'An Open-Source IDE & Coding Agent with First-Class Kimi Support · stagewise',
  description:
    "stagewise is an open-source IDE and coding agent with first-class support for Kimi K3, K2.7 Code, K2.6, and K2.5 from Moonshot AI. Kimi K3 is Moonshot's most capable flagship model, with 2.8T parameters, a 1M-token context, native visual understanding, and thinking mode always enabled. Run via stagewise Cloud Inference, your own Moonshot API key, or local inference.",
  openGraph: {
    title:
      'An Open-Source IDE & Coding Agent with First-Class Kimi Support · stagewise',
    description:
      "stagewise is an open-source IDE and coding agent with first-class support for Kimi K3, K2.7 Code, K2.6, and K2.5 from Moonshot AI. Kimi K3 is Moonshot's most capable flagship model, with 2.8T parameters, a 1M-token context, native visual understanding, and thinking mode always enabled. Run via stagewise Cloud Inference, your own Moonshot API key, or local inference.",
    type: 'website',
  },
  twitter: {
    title:
      'An Open-Source IDE & Coding Agent with First-Class Kimi Support · stagewise',
    description:
      "stagewise is an open-source IDE and coding agent with first-class support for Kimi K3, K2.7 Code, K2.6, and K2.5 from Moonshot AI. Kimi K3 is Moonshot's most capable flagship model, with 2.8T parameters, a 1M-token context, native visual understanding, and thinking mode always enabled. Run via stagewise Cloud Inference, your own Moonshot API key, or local inference.",
    creator: '@stagewise_io',
  },
  alternates: {
    canonical: 'https://stagewise.io/use-cases/kimi',
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
      name: 'Kimi',
      item: 'https://stagewise.io/use-cases/kimi',
    },
  ],
};

export default function KimiUseCasePage() {
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
                  Kimi
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
                    An Open-Source IDE and Coding Agent Built for Kimi
                  </span>
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  Kimi K3 is Moonshot's most capable flagship model, with 2.8T
                  parameters, a 1M-token context, native visual understanding,
                  and thinking mode always enabled. It handles long-horizon
                  coding tasks, large codebases, and sustained debugging.
                  stagewise gives it a local IDE with a coding agent built for
                  long-running work.
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

      {/* Why Kimi K3 stands out */}
      <section className="relative z-10 w-full py-3 md:py-4">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Why Kimi K3 stands out right now
                </h2>
                <p>
                  Kimi K3 is the world's first open-source model in the
                  3-trillion-parameter class, with 2.8T parameters built on Kimi
                  Delta Attention and Attention Residuals. It combines frontier
                  intelligence with a 1M-token context, native visual
                  understanding, and always-on thinking.
                </p>
                <p>
                  It is designed for long-horizon coding, knowledge work, and
                  reasoning. For complex multi-file refactors, deep debugging,
                  or problems that require sustained reasoning across a large
                  codebase, it is built to handle tasks that need frontier-grade
                  intelligence.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div className="not-prose mt-8">
                <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-surface-2">
                  {/* biome-ignore lint/performance/noImgElement: static benchmark asset */}
                  <img
                    src="/use-cases/kimi/intelligence-index.png"
                    alt="Artificial Analysis Intelligence Index showing model comparison scores"
                    width={4640}
                    height={1952}
                    className="block h-auto w-full bg-surface-1"
                  />
                </div>
                <p className="mt-3 text-center text-muted-foreground text-sm">
                  Artificial Analysis Intelligence Index, via{' '}
                  <a
                    href="https://artificialanalysis.ai/"
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
                  2.8T parameters with a 1M-token context
                </h3>
                <p>
                  Kimi K3 is the first open-source model to reach 2.8 trillion
                  parameters. It also offers a 1M-token context window — enough
                  to load large codebases, documentation, and conversation
                  history into a single request. That reduces the need for
                  aggressive context pruning on all but the longest tasks, and
                  lets the model work with a more complete picture of the
                  project.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="prose dark:prose-invert prose-p:my-0 mt-8 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h3 className="font-medium text-foreground text-lg">
                  Always-on thinking mode
                </h3>
                <p>
                  K3 always has thinking mode enabled. Thinking effort currently
                  runs at max level, with additional effort levels coming soon.
                  In stagewise, the runtime surfaces the thinking output so you
                  can follow the model&apos;s reasoning as it works.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={400}>
              <div className="prose dark:prose-invert prose-p:my-0 mt-8 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h3 className="font-medium text-foreground text-lg">
                  Native visual understanding — text and images
                </h3>
                <p>
                  Unlike{' '}
                  <Link
                    href="/use-cases/glm"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    GLM
                  </Link>{' '}
                  or{' '}
                  <Link
                    href="/use-cases/deepseek"
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    DeepSeek
                  </Link>
                  , Kimi K3 has native visual understanding — it accepts both
                  text and images. It can see and reason about screenshots,
                  design files, and UI layouts directly. That makes it suited
                  for frontend work, UI debugging, and tasks that depend on
                  visual appearance.
                </p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={500}>
              <div className="not-prose mt-8">
                <div className="relative w-full overflow-hidden rounded-lg ring-1 ring-surface-2">
                  {/* biome-ignore lint/performance/noImgElement: static benchmark asset */}
                  <img
                    src="/use-cases/kimi/mmmu-pro.png"
                    alt="MMMU-Pro benchmark showing visual reasoning scores across models"
                    width={4512}
                    height={1824}
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
          </div>
        </div>
      </section>

      {/* Efficiency through input caching */}
      <section className="relative z-10 w-full py-3 md:py-4">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal delay={600}>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Keeping long-running Kimi tasks practical
                </h2>
                <p>
                  Kimi K3 is strong enough that the bottleneck quickly becomes
                  runtime efficiency rather than raw model quality. Once a task
                  runs for dozens of turns, the agent runtime is what keeps
                  things working.
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
                  long refactors, and extended debugging sessions.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Kimi K3 — your way */}
      <section className="relative z-10 w-full py-3 md:py-4">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Use Kimi through a stagewise Account, your Moonshot API key,
                  or local inference
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
                  you get preconfigured access to Kimi models alongside a wide
                  range of other models, all without managing a separate API
                  key.
                </p>
                <p>
                  If you want to use Kimi with your own setup, you can supply
                  your{' '}
                  <a
                    href="https://platform.moonshot.ai/console/api-keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <strong>Moonshot API key</strong>
                  </a>{' '}
                  directly. You can set it up during onboarding, or later in the
                  settings.
                </p>
                <p>
                  If you already have Kimi access elsewhere, you can point the
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
                  You choose the billing and hosting model that fits your setup.
                </p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* How stagewise uses Kimi's multimodal input */}
      <section className="relative z-10 w-full py-3 md:py-4">
        <div className="flex justify-center">
          <div className="w-full max-w-4xl px-4">
            <ScrollReveal>
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-6 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  How stagewise uses Kimi&apos;s visual understanding
                </h2>
                <p>
                  stagewise agents can take screenshots of the website you are
                  working on and send them to Kimi K3. The model sees what is on
                  screen, checks visual output, and makes design corrections or
                  resolves layout issues directly from the screenshot.
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
              'Both. stagewise is a coding agent orchestrator: it ships its own first-class, model-independent agent harness — the runtime that handles tooling, context management, file access, and multi-agent orchestration — alongside the user interface you use to control that harness. The harness is model-agnostic, so it works with any capable model, including Kimi. You get the IDE and the agent in one product.',
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
                  model, including Kimi. You get the IDE and the agent in one
                  product.
                </p>
              </>
            ),
          },
          {
            question: 'How can I use Kimi in stagewise?',
            plainTextAnswer:
              'You can run Kimi in stagewise using three options: 1. stagewise Cloud Inference: With a stagewise Account, you get preconfigured access to a wide variety of models including Kimi K3, Kimi K2.7 Code, Kimi K2.6, and Kimi K2.5 — no keys, configuration, or external subscriptions required. 2. Your API Key: Supply your own Moonshot API key, or use an API aggregator (like OpenRouter or fireworks.ai) to route your queries. 3. Custom Endpoint: Connect stagewise to any custom endpoint — including local servers (Ollama, Llama.cpp), on-premise deployments (vLLM), or enterprise inference providers.',
            answer: (
              <>
                <p>You can run Kimi in stagewise using three options:</p>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  <li>
                    <Link
                      href="/pricing"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      <strong>stagewise Cloud Inference</strong>
                    </Link>
                    : With a stagewise Account, you get preconfigured access to
                    a wide variety of models including Kimi K3, Kimi K2.7 Code,
                    Kimi K2.6, and Kimi K2.5 — no keys, configuration, or
                    external subscriptions <em>required</em>.
                  </li>
                  <li>
                    <strong>Your API Key:</strong> Supply your own Moonshot API
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
            question: 'What Kimi models are supported?',
            plainTextAnswer:
              'The models listed on the stagewise home page — Kimi K3, Kimi K2.7 Code, Kimi K2.6, and Kimi K2.5 — are available out of the box. Beyond those, you can connect any additional Kimi model that has agentic capabilities through your own API key or inference provider.',
            answer: (
              <>
                <p>
                  The models listed on the stagewise home page —{' '}
                  <strong>Kimi K3</strong>, <strong>Kimi K2.7 Code</strong>,
                  <strong> Kimi K2.6</strong>, and <strong>Kimi K2.5</strong> —
                  are available <em>out of the box</em>. Beyond those, you can
                  connect any additional Kimi model that has agentic
                  capabilities through your own API key or inference provider.
                </p>
              </>
            ),
          },
          {
            question: 'Can I use my Moonshot API key with stagewise?',
            plainTextAnswer:
              'Yes. You can use your existing Moonshot API key with stagewise. Set it up during onboarding, or later in the settings at any time. You can also switch between providers whenever you like — stagewise Cloud Inference, your own Moonshot API key, or local inference — without losing your work or configuration.',
            answer: (
              <>
                <p>
                  Yes. You can use your existing Moonshot API key with
                  stagewise.
                </p>
                <p>
                  You can set it up during <strong>onboarding</strong>, or later
                  in the <strong>settings</strong> at any time.
                </p>
                <p>
                  You can also <strong>switch between providers</strong>{' '}
                  whenever you like — stagewise Cloud Inference, your own
                  Moonshot API key, or local inference — without losing your
                  work or configuration.
                </p>
              </>
            ),
          },
          {
            question:
              'Can I use fine-tuned or quantized variants of Kimi models with stagewise?',
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
            question: 'Can I use a locally hosted Kimi model?',
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
              'Can I connect an enterprise inference provider to use Kimi models?',
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
                  An Open-Source IDE and Coding Agent Built for Kimi
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
