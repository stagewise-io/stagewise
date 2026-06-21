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
      name: 'Hobby',
      price: 'Free',
      period: '',
      features: [
        'Limited access to all models',
        'Bring Your Own Key (BYOK) for unlimited access and custom models',
      ],
      cta: 'Start now',
      popular: false,
      useDownloadButton: true,
    },
    {
      name: 'Individual',
      price: '',
      period: '',
      features: [],
      popular: false,
      useSecondaryButton: true,
      variants: [
        {
          label: 'Pro',
          price: '$20',
          period: '/mo',
          features: [
            '6x higher limits on all models',
            'Extend usage with extra credits',
            'Run additional models from custom endpoints',
          ],
          cta: 'Get Pro',
          href: 'https://console.stagewise.io',
        },
        {
          label: 'Ultra',
          price: '$200',
          period: '/mo',
          features: [
            '75x higher limits on all models',
            'Extend usage with extra credits',
            'Run additional models from custom endpoints',
          ],
          cta: 'Get Ultra',
          href: 'https://console.stagewise.io',
        },
      ],
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      features: [
        'Regulatory and audit compliance',
        'Global configuration of inference and models',
        'Access to stagewise Cloud Inference and stagewise Cloud Inference EU',
        'SSO with OIDC and SAML',
        'Provisioning with SCIM',
        'Optional self-hosting of the stagewise Cloud',
      ],
      cta: 'Contact Sales',
      popular: false,
      useSecondaryButton: true,
      href: '/enterprise',
    },
  ];

  return (
    <section className="relative z-10 mt-12 w-full pb-4 md:pb-6">
      <div className="flex justify-start">
        <div className="w-full max-w-7xl">
          <ScrollReveal>
            <div className="mt-0 mb-6 flex flex-col items-start px-4 text-left md:mt-2 md:mb-8">
              <h1 className="mb-4 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="text-foreground">Pricing</span>
              </h1>
              <p className="max-w-2xl text-lg text-muted-foreground leading-relaxed">
                Start for free, then upgrade to Pro or Ultra for significantly
                higher limits across all models - or bring your own key for
                unlimited access.
              </p>
            </div>
          </ScrollReveal>

          <div className="mt-12 px-4">
            <PricingCards plans={plans} />
          </div>
        </div>
      </div>
    </section>
  );
}
