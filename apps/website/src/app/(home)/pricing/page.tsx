import type { Metadata } from 'next';
import { CheckCircle } from 'lucide-react';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

export const metadata: Metadata = {
  title: 'Pricing | stagewise',
  description:
    'Simple, transparent pricing for stagewise. Start building faster with our AI-powered frontend development tools.',
  openGraph: {
    title: 'Pricing | stagewise',
    description:
      'Simple, transparent pricing for stagewise. Start building faster with our AI-powered frontend development tools.',
    type: 'website',
  },
  twitter: {
    title: 'Pricing | stagewise',
    description:
      'Simple, transparent pricing for stagewise. Start building faster with our AI-powered frontend development tools.',
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
      features: ['€5 starting credits included', 'Community support'],

      popular: false,
    },
    {
      name: 'Pro',
      price: '€20',
      period: 'per month',
      description: 'Full access with monthly credits included',
      features: [
        '€20 monthly credits included',
        'Full platform access',
        'Priority support',
      ],

      popular: true,
      vatNote: 'excl. 19% German VAT',
    },
  ];

  return (
    <div className="flex w-full max-w-6xl flex-col gap-12 px-4">
      <ScrollReveal>
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="bg-gradient-to-tr from-zinc-900 via-zinc-700 to-black bg-clip-text font-bold text-3xl text-transparent tracking-tight md:text-5xl dark:from-zinc-100 dark:via-zinc-300 dark:to-white">
            Simple, transparent pricing
          </h1>
          <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
            Start with €5 free credits, then pay €20/month for full access. Your
            subscription fee becomes usable credits.
          </p>
        </div>
      </ScrollReveal>

      <div className="mx-auto max-w-4xl">
        <div className="grid gap-8 md:grid-cols-2 md:items-stretch">
          {plans.map((plan) => (
            <ScrollReveal key={plan.name} delay={100}>
              <div className="glass-body relative flex h-full flex-col rounded-2xl bg-white/80 p-8 dark:bg-zinc-900/80">
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
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl">
        <ScrollReveal delay={200}>
          <div>
            <div className="mb-8 border-zinc-200 border-t dark:border-zinc-800" />
            <h2 className="mb-8 text-center font-bold text-2xl text-zinc-900 dark:text-white">
              Usage-Based Pricing
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="text-center">
                <div className="mb-2 font-bold text-3xl text-zinc-900 dark:text-white">
                  €1.50
                </div>
                <div className="text-zinc-600 dark:text-zinc-400">
                  per 1M input tokens
                </div>
              </div>
              <div className="text-center">
                <div className="mb-2 font-bold text-3xl text-zinc-900 dark:text-white">
                  €7.50
                </div>
                <div className="text-zinc-600 dark:text-zinc-400">
                  per 1M output tokens
                </div>
              </div>
            </div>
            <p className="mt-6 text-center text-zinc-600 dark:text-zinc-400">
              Only pay for what you use. Credits from your Pro subscription can
              be used towards usage costs.
            </p>
          </div>
        </ScrollReveal>
      </div>
    </div>
  );
}
