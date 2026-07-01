import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { FaqItem } from '../use-cases/_components/faq-item';

const HOME_FAQ_ITEMS = [
  {
    question: 'What models can I use with stagewise?',
    plainTextAnswer:
      'stagewise supports any model with agentic capabilities. Use frontier models (Claude, GPT, Gemini), open-weight models (DeepSeek, Qwen, GLM, Kimi, MiniMax), or locally hosted models (Ollama, vLLM, Llama.cpp) — all through the same interface.',
    answer: (
      <>
        <p>
          stagewise supports <em>any</em> model with agentic capabilities. Use{' '}
          <strong>frontier models</strong> (Claude, GPT, Gemini),{' '}
          <strong>open-weight models</strong> (DeepSeek, Qwen, GLM, Kimi,
          MiniMax), or <strong>locally hosted models</strong> (Ollama, vLLM,
          Llama.cpp) — all through the same interface.
        </p>
      </>
    ),
  },
  {
    question: 'Do I need an API key to get started?',
    plainTextAnswer:
      'No. With a stagewise Account, you get preconfigured access to a wide variety of models through stagewise Cloud Inference — no keys, configuration, or external subscriptions required. You can also bring your own API key or connect a custom endpoint at any time.',
    answer: (
      <>
        <p>
          <strong>No.</strong> With a stagewise Account, you get preconfigured
          access to a wide variety of models through{' '}
          <strong>stagewise Cloud Inference</strong> — no keys, configuration,
          or external subscriptions <em>required</em>.
        </p>
        <p>
          You can also bring your own API key or connect a custom endpoint at
          any time.
        </p>
      </>
    ),
  },
  {
    question: 'Can I run models locally?',
    plainTextAnswer:
      'Yes. You can configure stagewise Agents to use models from any source, including a local setup using Ollama or an on-premise deployment with vLLM. We support any inference provider that serves models via OpenAI Chat Completions API, OpenResponses API, or Anthropic Messages API. The minimum recommended context size is 150k tokens.',
    answer: (
      <>
        <p>
          <strong>Yes.</strong> You can configure stagewise Agents to use models
          from <em>any</em> source, including a local setup using Ollama or an
          on-premise deployment with vLLM.
        </p>
        <p>
          We support any inference provider that serves models via OpenAI Chat
          Completions API, OpenResponses API, or Anthropic Messages API.
        </p>
        <p>
          The minimum recommended context size is <strong>150k tokens</strong>.
        </p>
      </>
    ),
  },
  {
    question: 'Is stagewise open source?',
    plainTextAnswer:
      'Yes. The stagewise Agentic IDE is fully open source under the AGPLv3 license. The entire codebase is publicly available on GitHub at github.com/stagewise-io/stagewise — you can inspect it, build from source, or run your own instance. External contributions are welcome but reviewed carefully to maintain quality and project direction.',
    answer: (
      <>
        <p>
          <strong>Yes.</strong> The stagewise Agentic IDE is fully open source
          under the <strong>AGPLv3 license</strong>. The entire codebase is
          publicly available on{' '}
          <a
            href="https://github.com/stagewise-io/stagewise"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>{' '}
          — you can inspect it, build from source, or run your own instance.
        </p>
        <p>
          External contributions are welcome but reviewed carefully to maintain
          quality and project direction.
        </p>
      </>
    ),
  },
  {
    question: 'Can I use my existing coding subscription?',
    plainTextAnswer:
      'Yes. stagewise supports bringing your own API keys for existing subscriptions including OpenAI, Anthropic, Google Gemini, DeepSeek, Kimi, Qwen, and MiniMax. You can also use API aggregators like OpenRouter or fireworks.ai.',
    answer: (
      <>
        <p>
          <strong>Yes.</strong> stagewise supports bringing your own API keys
          for existing subscriptions including OpenAI, Anthropic, Google Gemini,
          DeepSeek, Kimi, Qwen, and MiniMax. You can also use API aggregators
          like <strong>OpenRouter</strong> or <strong>fireworks.ai</strong>.
        </p>
      </>
    ),
  },
  {
    question: 'How does stagewise handle context for long-running tasks?',
    plainTextAnswer:
      'stagewise keeps the conversation prefix stable across turns to maximize cache hit rates. When the environment changes, it sends a compact state delta instead of rebuilding the full context. This ensures the agent stays continuously aware of changes in terminals, browser tabs, and more, while remaining extremely token-efficient. The runtime also automatically compresses older turns as tasks grow, keeping a focused working set.',
    answer: (
      <>
        <p>
          stagewise keeps the conversation prefix{' '}
          <strong>stable across turns</strong> to maximize cache hit rates. When
          the environment changes, it sends a compact{' '}
          <strong>state delta</strong> instead of rebuilding the full context.
        </p>
        <p>
          This ensures the agent stays <em>continuously aware</em> of changes in
          terminals, browser tabs, and more, while remaining extremely{' '}
          <strong>token-efficient</strong>.
        </p>
        <p>
          The runtime also automatically <strong>compresses context</strong> as
          tasks grow, keeping a focused working set.
        </p>
      </>
    ),
  },
];

export function HomeFAQ() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: HOME_FAQ_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.plainTextAnswer,
      },
    })),
  };

  return (
    <section className="relative z-10 w-full py-20 md:py-28">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex justify-center">
        <ScrollReveal>
          <div className="mb-12 max-w-3xl pt-8 text-center">
            <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
              Frequently Asked Questions
            </h2>
            <p className="text-base text-muted-foreground">
              Everything you need to know about using stagewise with your
              models.
            </p>
          </div>
          <div className="mx-auto w-full max-w-3xl space-y-4">
            {HOME_FAQ_ITEMS.map((item, index) => (
              <FaqItem
                key={index}
                index={index}
                question={item.question}
                answer={item.answer}
              />
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
