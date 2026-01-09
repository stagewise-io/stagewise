import type { Metadata } from 'next';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { PricingCards } from './pricing-cards';

export const metadata: Metadata = {
  title: 'Pricing · stagewise',
  description:
    'Simple, transparent pricing for stagewise. The browser built for web developers.',
  openGraph: {
    title: 'Pricing · stagewise',
    description:
      'Simple, transparent pricing for stagewise. The browser built for web developers.',
    type: 'website',
  },
  twitter: {
    title: 'Pricing · stagewise',
    description:
      'Simple, transparent pricing for stagewise. The browser built for web developers.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function PricingPage() {
  const plans = [
    {
      name: 'Trial',
      price: 'Free',
      period: 'to start',
      description: 'Perfect for getting started with stagewise',
      features: ['~10 daily prompts', 'Community support'],

      popular: false,
    },
    {
      name: 'Pro',
      price: '€20',
      period: 'per month',
      description: 'Full access with limited prompts',
      features: [
        '~100 daily prompts',
        'Full platform access',
        'Priority support',
      ],

      popular: true,
      vatNote: 'excl. 19% German VAT',
    },
  ];

  return (
    <div className="relative mx-auto w-full max-w-6xl px-4">
      <ScrollReveal>
        <div className="flex flex-col items-start gap-4 text-left">
          <h1 className="font-medium text-3xl text-foreground tracking-tight md:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Start with a free trial, then upgrade to Pro for full access with
            generous usage limits included.
          </p>
        </div>
      </ScrollReveal>

      <div className="mt-12">
        <PricingCards plans={plans} />
      </div>
    </div>
  );
}
