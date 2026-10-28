import Image from 'next/image';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import efficientCodingAgentDark from './feature-images/efficient-coding-agent-dark.webp';
import efficientCodingAgentLight from './feature-images/efficient-coding-agent-light.webp';
import agentManagementDark from './feature-images/agent-management-dark.webp';
import agentManagementLight from './feature-images/agent-management-light.webp';
import bgDark from './feature-images/bg-dark.jpg';
import bgLight from './feature-images/bg-light.jpg';
import useExistingSubscriptionDark from './feature-images/use-existing-subscription-dark.webp';
import useExistingSubscriptionLight from './feature-images/use-existing-subscription-light.webp';

const FEATURE_IMAGE_SIZES =
  '(min-width: 1280px) 700px, (min-width: 768px) 60vw, calc(100vw - 80px)';
const FEATURE_ZOOM_IMAGE_SIZES =
  '(min-width: 1280px) 1200px, (min-width: 768px) 90vw, 100vw';
const AGENT_MANAGEMENT_IMAGE_SIZES =
  '(min-width: 1280px) 2100px, (min-width: 768px) 180vw, 200vw';

export function FeatureSection() {
  return (
    <section className="relative z-10 w-full py-20 md:py-28">
      <div className="flex justify-center">
        <ScrollReveal>
          <div className="mb-20 max-w-3xl pt-8 text-center">
            <h2 className="mb-4 font-medium text-2xl tracking-tight md:text-3xl">
              Built for developers
            </h2>
            <p className="text-base text-muted-foreground">
              stagewise delivers an agentic coding experience built around the
              needs of developers.
            </p>
          </div>
        </ScrollReveal>
      </div>

      <div className="flex flex-col items-stretch gap-10 md:gap-20">
        <ScrollReveal delay={100}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-6 md:flex-row md:items-center md:gap-12">
            <div className="space-y-2">
              <h3 className="font-medium text-2xl">Efficient coding agent</h3>
              <p className="text-base text-muted-foreground">
                The stagewise agent maximizes cache-hit rates and dynamically
                controls context — enabling long-running tasks at surprisingly
                low cost.
              </p>
              <div className="pt-12">
                <p className="font-semibold text-3xl text-foreground tracking-tight">
                  87.6%
                </p>
                <p className="text-muted-foreground text-sm">
                  Avg. Cache Hit Rate
                </p>
              </div>
            </div>
            <div
              className="relative w-full shrink-0 overflow-hidden rounded-md ring-1 ring-surface-2 md:max-w-[60%]"
              style={{ aspectRatio: '1 / 1' }}
            >
              <Image
                src={bgLight}
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={bgDark}
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={efficientCodingAgentLight}
                className="absolute top-1/2 left-0 w-full dark:hidden"
                style={{
                  transform: 'translateX(0%) translateY(-50%) scale(1.6)',
                  transformOrigin: 'left center',
                }}
                alt="Efficient coding agent view"
                sizes={FEATURE_ZOOM_IMAGE_SIZES}
                quality={80}
              />
              <Image
                src={efficientCodingAgentDark}
                className="absolute top-1/2 left-0 hidden w-full dark:block"
                style={{
                  transform: 'translateX(0%) translateY(-50%) scale(1.6)',
                  transformOrigin: 'left center',
                }}
                alt="Efficient coding agent view"
                sizes={FEATURE_ZOOM_IMAGE_SIZES}
                quality={80}
              />
            </div>
          </div>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-6 md:flex-row-reverse md:items-center md:gap-12">
            <div className="space-y-2">
              <h3 className="font-medium text-2xl">
                Orchestrate many agents at once
              </h3>
              <p className="text-base text-muted-foreground">
                stagewise is your command center for running agents in parallel
                — each implementing full features or fixing bugs independently.
              </p>
            </div>
            <div
              className="relative w-full shrink-0 overflow-hidden rounded-md ring-1 ring-surface-2 md:max-w-[60%]"
              style={{ aspectRatio: '1 / 1' }}
            >
              <Image
                src={bgLight}
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={bgDark}
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={agentManagementLight}
                className="absolute top-0 left-0 w-full dark:hidden"
                style={{ transform: 'scale(3)', transformOrigin: 'top left' }}
                alt="Agent management view"
                sizes={AGENT_MANAGEMENT_IMAGE_SIZES}
                quality={85}
              />
              <Image
                src={agentManagementDark}
                className="absolute top-0 left-0 hidden w-full dark:block"
                style={{ transform: 'scale(3)', transformOrigin: 'top left' }}
                alt="Agent management view"
                sizes={AGENT_MANAGEMENT_IMAGE_SIZES}
                quality={85}
              />
            </div>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={300}>
          <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-6 md:flex-row md:items-center md:gap-12">
            <div className="space-y-2">
              <h3 className="font-medium text-2xl">
                Use any coding subscription
              </h3>
              <p className="text-base text-muted-foreground">
                Connect any existing coding subscription, or use custom
                endpoints or inference API providers.
              </p>
              <div className="pt-12">
                <p className="mb-3 text-muted-foreground text-sm">
                  Supported subscriptions
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Kimi',
                    'Qwen Coding Plan',
                    'MiniMax',
                    'Xiaomi MiMo',
                    'OpenAI',
                    'Anthropic',
                    'Google Gemini',
                    'DeepSeek',
                  ].map((plan) => (
                    <span
                      key={plan}
                      className="rounded-full border border-border-subtle px-3 py-1 text-foreground/80 text-sm"
                    >
                      {plan}
                    </span>
                  ))}
                  <span className="px-1 py-1 text-muted-foreground/50 text-sm">
                    & more
                  </span>
                </div>
              </div>
            </div>
            <div
              className="relative w-full shrink-0 overflow-hidden rounded-md ring-1 ring-surface-2 md:max-w-[60%]"
              style={{ aspectRatio: '1 / 1' }}
            >
              <Image
                src={bgLight}
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={bgDark}
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                alt=""
                sizes={FEATURE_IMAGE_SIZES}
                quality={70}
              />
              <Image
                src={useExistingSubscriptionLight}
                className="absolute top-1/2 left-1/2 w-full dark:hidden"
                style={{
                  transform: 'translateX(-50%) translateY(-50%) scale(0.92)',
                  transformOrigin: 'center center',
                }}
                alt="Use existing subscription view"
                sizes={FEATURE_IMAGE_SIZES}
                quality={80}
              />
              <Image
                src={useExistingSubscriptionDark}
                className="absolute top-1/2 left-1/2 hidden w-full dark:block"
                style={{
                  transform: 'translateX(-50%) translateY(-50%) scale(0.92)',
                  transformOrigin: 'center center',
                }}
                alt="Use existing subscription view"
                sizes={FEATURE_IMAGE_SIZES}
                quality={80}
              />
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
