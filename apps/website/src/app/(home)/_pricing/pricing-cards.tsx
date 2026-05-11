'use client';

import { IconCheckOutline18 } from 'nucleo-ui-outline-18';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';

interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta?: string;
  popular: boolean;
  vatNote?: string;
}

interface PricingCardsProps {
  plans: Plan[];
}

export function PricingCards({ plans }: PricingCardsProps) {
  return (
    <div>
      <div className="grid gap-8 md:grid-cols-3 md:items-stretch">
        {plans.map((plan) => (
          <ScrollReveal key={plan.name} delay={100}>
            <div className="relative flex h-full flex-col rounded-2xl bg-surface-1 p-8">
              <div className="mb-8 text-center">
                <h3 className="mb-6 font-bold text-2xl text-foreground">
                  {plan.name}
                </h3>
                <div className="mb-4">
                  <span className="font-bold text-4xl text-foreground">
                    {plan.price}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {plan.period}
                  </span>
                  {plan.vatNote && (
                    <div className="mt-1 text-sm text-subtle-foreground">
                      {plan.vatNote}
                    </div>
                  )}
                </div>
                <p className="text-muted-foreground">{plan.description}</p>
              </div>

              <div className="mb-8 flex-1">
                <ul className="space-y-4">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-3"
                      style={{ listStyle: 'none' }}
                    >
                      <IconCheckOutline18 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-foreground" />
                      <span className="text-foreground">{feature}</span>
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
                {plan.cta ?? 'Get Started'}
              </Button>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}
