import type { Metadata } from 'next';
import { UseCaseContent } from '../_components/use-case-content';

export const metadata: Metadata = {
  title: 'An Open-Source Agentic IDE for Kimi · stagewise',
  description:
    'stagewise is a frontier-grade harness that maximizes the power of Kimi and serves Kimi models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with Kimi.',
  openGraph: {
    title: 'An Open-Source Agentic IDE for Kimi · stagewise',
    description:
      'stagewise is a frontier-grade harness that maximizes the power of Kimi and serves Kimi models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with Kimi.',
    type: 'website',
  },
  twitter: {
    title: 'An Open-Source Agentic IDE for Kimi · stagewise',
    description:
      'stagewise is a frontier-grade harness that maximizes the power of Kimi and serves Kimi models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with Kimi.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function KimiUseCasePage() {
  return <UseCaseContent modelName="Kimi" />;
}
