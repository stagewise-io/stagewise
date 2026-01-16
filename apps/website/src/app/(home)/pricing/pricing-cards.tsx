'use client';

import { CheckCircle } from 'lucide-react';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';

interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular: boolean;
  vatNote?: string;
}

interface PricingCardsProps {
  plans: Plan[];
}

export function PricingCards({ plans }: PricingCardsProps) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="grid gap-8 md:grid-cols-2 md:items-stretch">
        {plans.map((plan) => (
          <ScrollReveal key={plan.name} delay={100}>
            <div className="relative flex h-full flex-col rounded-2xl bg-surface-1 p-8">
              <div className="mb-8 text-center">
                <h3 className="mb-6 font-bold text-2xl text-zinc-900 dark:text-white">
                  {plan.name}
                </h3>
                <div className="mb-4">
                  <span className="font-bold text-4xl text-zinc-900 dark:text-white">
                    {plan.price}
                  </span>
                  <span className="ml-2 text-zinc-600 dark:text-zinc-400">
                    {plan.period}
                  </span>
                  {plan.vatNote && (
                    <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
                      {plan.vatNote}
                    </div>
                  )}
                </div>
                <p className="text-zinc-600 dark:text-zinc-400">
                  {plan.description}
                </p>
              </div>

              <div className="mb-8 flex-1">
                <ul className="space-y-4">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button
                onClick={() =>
                  window.open('https://console.stagewise.io', '_blank')
                }
                className={cn('w-full', !plan.popular && 'bg-surface-2')}
                variant={plan.popular ? 'primary' : 'secondary'}
                size="lg"
              >
                Get Started
              </Button>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
