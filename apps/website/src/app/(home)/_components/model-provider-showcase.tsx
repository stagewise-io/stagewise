'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

type Tier = 'frontier' | 'general' | 'lightweight';

interface ProviderInfo {
  id: string;
  name: string;
  logo: string;
  description: string;
  models: { name: string; tier: Tier }[];
  monoInDark?: boolean;
}

const TIER_LABELS: Record<Tier, string> = {
  frontier: 'Frontier',
  general: 'General Use',
  lightweight: 'Lightweight & Cheap',
};

const ALL_TIERS: Tier[] = ['frontier', 'general', 'lightweight'];

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    logo: '/provider-logos/openai.svg',
    monoInDark: true,
    description:
      'Frontier reasoning and multimodal models for coding and agents.',
    models: [
      { name: 'GPT-5.5', tier: 'frontier' },
      { name: 'GPT-5.4', tier: 'frontier' },
      { name: 'GPT-5.3 Codex', tier: 'frontier' },
      { name: 'GPT-5.3 Instant', tier: 'general' },
      { name: 'GPT-5.4 mini', tier: 'general' },
      { name: 'GPT-5.4 nano', tier: 'lightweight' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    logo: '/provider-logos/claude.svg',
    description:
      'Best-in-class instruction following and long-context reasoning.',
    models: [
      { name: 'Opus 4.7', tier: 'frontier' },
      { name: 'Opus 4.6', tier: 'frontier' },
      { name: 'Sonnet 4.6', tier: 'general' },
      { name: 'Haiku 4.5', tier: 'lightweight' },
    ],
  },
  {
    id: 'google',
    name: 'Google Gemini',
    logo: '/provider-logos/gemini.svg',
    description:
      'Multimodal models with massive context windows and fast inference.',
    models: [
      { name: 'Gemini 3.1 Pro', tier: 'frontier' },
      { name: 'Gemini 3 Flash', tier: 'general' },
      { name: 'Gemini 3.1 Flash Lite', tier: 'lightweight' },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    logo: '/provider-logos/deepseek.svg',
    description:
      'High-capability open-weight models at a fraction of the cost.',
    models: [
      { name: 'DeepSeek V4 Pro', tier: 'frontier' },
      { name: 'DeepSeek V4 Flash', tier: 'lightweight' },
    ],
  },
  {
    id: 'alibaba',
    name: 'Qwen',
    logo: '/provider-logos/qwen.svg',
    description:
      "Alibaba's open-weight coding specialists with strong tool use.",
    models: [
      { name: 'Qwen 3-32B', tier: 'general' },
      { name: 'Qwen 3-Coder 30B-A3B', tier: 'lightweight' },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    logo: '/provider-logos/minimax.svg',
    description:
      'Agentic models tuned for multi-step reasoning and coding tasks.',
    models: [
      { name: 'MiniMax M2.7', tier: 'frontier' },
      { name: 'MiniMax M2', tier: 'general' },
    ],
  },
  {
    id: 'moonshotai',
    name: 'Moonshot AI',
    logo: '/provider-logos/moonshot.svg',
    monoInDark: true,
    description: 'Long-horizon coding and native multimodal input.',
    models: [
      { name: 'Kimi K2.6', tier: 'frontier' },
      { name: 'Kimi K2.5', tier: 'general' },
    ],
  },
  {
    id: 'z-ai',
    name: 'Z.AI',
    logo: '/provider-logos/zai.svg',
    monoInDark: true,
    description: 'Vision-capable agentic models for coding and browser tasks.',
    models: [
      { name: 'GLM 5.1', tier: 'frontier' },
      { name: 'GLM 5V-Turbo', tier: 'general' },
    ],
  },
];

export function ModelProviderShowcase() {
  const [activeId, setActiveId] = useState<string | null>(null);
  // lastProviderRef keeps content mounted during fade-out — only updated on enter.
  const lastProviderRef = useRef<ProviderInfo | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = (id: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    lastProviderRef.current = PROVIDERS.find((p) => p.id === id) ?? null;
    setActiveId(id);
  };

  const leave = () => {
    timerRef.current = setTimeout(() => setActiveId(null), 80);
  };

  const keepOpen = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const displayProvider = lastProviderRef.current;

  return (
    <section className="relative z-50 w-full pb-16 md:pb-20">
      <div className="flex justify-center">
        <div className="w-full">
          <div className="relative">
            <ScrollReveal>
              <p className="mb-10 text-center text-base text-muted-foreground">
                Works with all major model providers
              </p>

              {/* Logos row */}
              <div className="flex flex-wrap items-center justify-center gap-x-20 gap-y-12 pb-3">
                {PROVIDERS.map((provider) => (
                  <div
                    key={provider.id}
                    className="flex cursor-default items-center"
                    onMouseEnter={() => enter(provider.id)}
                    onMouseLeave={leave}
                  >
                    <Image
                      src={provider.logo}
                      alt={`${provider.name} logo`}
                      width={0}
                      height={0}
                      style={{ height: '36px', width: 'auto' }}
                      className={cn(
                        'transition-all duration-200',
                        activeId === provider.id
                          ? provider.monoInDark
                            ? 'opacity-100 [filter:brightness(0)] dark:[filter:brightness(0)_invert(1)]'
                            : 'opacity-100 [filter:none]'
                          : 'opacity-35 [filter:brightness(0)] dark:[filter:brightness(0)_invert(1)]',
                      )}
                      unoptimized
                    />
                  </div>
                ))}
              </div>
            </ScrollReveal>

            {/* Invisible gap-bridge so the panel doesn't close mid-hover */}
            <div
              className="absolute right-0 bottom-0 left-0 h-3"
              onMouseEnter={keepOpen}
              onMouseLeave={leave}
            />

            {/* Full-bleed hover panel — outside ScrollReveal so backdrop-filter isn't clipped by transform */}
            <div
              className={cn(
                '-translate-x-1/2 absolute top-full left-1/2 z-50 w-screen',
                'bg-surface-1/80 shadow-black/5 shadow-lg backdrop-blur-lg',
                'transition-opacity duration-250 ease-out',
                activeId
                  ? 'pointer-events-auto opacity-100'
                  : 'pointer-events-none opacity-0',
              )}
              onMouseEnter={keepOpen}
              onMouseLeave={leave}
            >
              {/* Content constrained to page max-width */}
              <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
                {displayProvider && (
                  <>
                    <div className="mb-6">
                      <p className="font-semibold text-foreground text-xl">
                        {displayProvider.name}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {displayProvider.description}
                      </p>
                    </div>

                    {/* 3-column on md+, stacked on small */}
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                      {ALL_TIERS.map((tier) => {
                        const models = displayProvider.models
                          .filter((m) => m.tier === tier)
                          .map((m) => m.name);
                        return (
                          <div key={tier}>
                            <p className="mb-2 font-semibold text-muted-foreground/60 text-xs uppercase tracking-wider">
                              {TIER_LABELS[tier]}
                            </p>
                            {models.length > 0 ? (
                              <ul className="space-y-1">
                                {models.map((model) => (
                                  <li
                                    key={model}
                                    className="text-foreground/80 text-sm"
                                  >
                                    {model}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-muted-foreground/40 text-sm">
                                —
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
