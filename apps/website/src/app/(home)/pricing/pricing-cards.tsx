'use client';

import { useState } from 'react';
import { IconCheckOutline18 } from 'nucleo-ui-outline-18';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { Button } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { DownloadButtons } from '../_components/home-client';

interface PlanVariant {
  label: string;
  price: string;
  period: string;
  features: string[];
  cta?: string;
}

interface Plan {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta?: string;
  popular: boolean;
  vatNote?: string;
  useDownloadButton?: boolean;
  useSecondaryButton?: boolean;
  href?: string;
  variants?: PlanVariant[];
}

interface PricingCardsProps {
  plans: Plan[];
}

export function PricingCards({ plans }: PricingCardsProps) {
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3 md:items-stretch">
        {plans.map((plan) => (
          <ScrollReveal key={plan.name} delay={100}>
            <PricingCard plan={plan} />
          </ScrollReveal>
        ))}
      </div>
    </div>
  );
}

function PricingCard({ plan }: { plan: Plan }) {
  const [selectedVariant, setSelectedVariant] = useState(0);

  const hasVariants = plan.variants && plan.variants.length > 0;
  const variant = hasVariants ? plan.variants![selectedVariant] : null;

  const displayPrice = variant ? variant.price : plan.price;
  const displayPeriod = variant ? variant.period : plan.period;
  const displayFeatures = variant ? variant.features : plan.features;
  const displayCta = variant ? variant.cta : plan.cta;

  return (
    <div className="relative flex h-full flex-col rounded-lg bg-surface-1 p-5">
      <div className="mb-6 text-center">
        <h3 className="mb-3 font-medium text-2xl text-foreground">
          {plan.name}
        </h3>

        <div className="mb-3 flex items-baseline justify-center">
          <span className="font-medium text-muted-foreground text-xl">
            {displayPrice}
            {displayPeriod && (
              <span className="ml-0.5 font-normal text-muted-foreground text-sm">
                {displayPeriod}
              </span>
            )}
          </span>
          {plan.vatNote && (
            <div className="mt-1 text-sm text-subtle-foreground">
              {plan.vatNote}
            </div>
          )}
        </div>

        {hasVariants && (
          <div className="mb-4 inline-flex rounded-lg bg-surface-2 p-0.5">
            {plan.variants!.map((v, i) => (
              <button
                key={v.label}
                type="button"
                onClick={() => setSelectedVariant(i)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm transition-colors',
                  i === selectedVariant
                    ? 'bg-background font-medium text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mb-6 flex-1">
        <ul className="space-y-3">
          {displayFeatures.map((feature) => (
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

      {plan.useDownloadButton ? (
        <DownloadButtons className="w-full" />
      ) : plan.href ? (
        <a href={plan.href} className="block">
          <Button
            className={cn('w-full', !plan.popular && 'bg-surface-2')}
            variant={
              plan.useSecondaryButton
                ? 'secondary'
                : plan.popular
                  ? 'primary'
                  : 'secondary'
            }
            size="lg"
          >
            {displayCta ?? 'Get Started'}
          </Button>
        </a>
      ) : (
        <Button
          onClick={() => window.open('https://console.stagewise.io', '_blank')}
          className={cn('w-full', !plan.popular && 'bg-surface-2')}
          variant={
            plan.useSecondaryButton
              ? 'secondary'
              : plan.popular
                ? 'primary'
                : 'secondary'
          }
          size="lg"
        >
          {displayCta ?? 'Get Started'}
        </Button>
      )}
    </div>
  );
}
