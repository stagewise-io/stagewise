import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { DownloadButtons } from '../../_components/home-client';

interface UseCaseContentProps {
  modelName: string;
}

export function UseCaseContent({ modelName }: UseCaseContentProps) {
  return (
    <section className="relative z-10 mt-12 w-full pb-4 md:pb-6">
      <div className="flex justify-center">
        <div className="w-full max-w-7xl">
          <ScrollReveal>
            <div className="mt-0 mb-6 flex flex-col items-start px-4 text-left md:mt-2 md:mb-8">
              <h1 className="mb-4 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="text-foreground">
                  An Open-Source Agentic IDE for {modelName}
                </span>
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
                stagewise is a frontier-grade harness that maximizes the power
                of {modelName} and serves {modelName} models either via the
                stagewise Account, your existing subscriptions or your API keys.
                Get a first class coding experience with {modelName}.
              </p>
              <div className="mt-8">
                <DownloadButtons />
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <div className="mt-12 px-4">
              <div className="prose dark:prose-invert prose-p:my-0 prose-headings:mt-12 prose-headings:mb-4 max-w-none [&>p+p]:mt-5">
                <h2 className="font-medium text-foreground text-xl">
                  Why use {modelName} with stagewise?
                </h2>
                <p>
                  {modelName} is a powerful model that excels at code
                  generation, reasoning, and multi-step development tasks. With
                  stagewise, you can leverage {modelName} as the driving force
                  behind your coding agent — getting autonomous code changes,
                  context-aware suggestions, and full project understanding.
                </p>
                <p>
                  stagewise maximizes the capabilities of {modelName} by
                  providing a frontier-grade agent harness that manages context
                  efficiently, orchestrates multi-step workflows, and integrates
                  directly with your development environment. Whether you use
                  the stagewise Account, bring your own API key, or connect your
                  existing subscription, {modelName} runs first-class inside
                  stagewise.
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
