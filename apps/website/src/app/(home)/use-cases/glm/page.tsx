import type { Metadata } from 'next';
import { UseCaseContent } from '../_components/use-case-content';

export const metadata: Metadata = {
  title: 'An Open-Source Agentic IDE for GLM · stagewise',
  description:
    'stagewise is a frontier-grade harness that maximizes the power of GLM and serves GLM models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with GLM.',
  openGraph: {
    title: 'An Open-Source Agentic IDE for GLM · stagewise',
    description:
      'stagewise is a frontier-grade harness that maximizes the power of GLM and serves GLM models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with GLM.',
    type: 'website',
  },
  twitter: {
    title: 'An Open-Source Agentic IDE for GLM · stagewise',
    description:
      'stagewise is a frontier-grade harness that maximizes the power of GLM and serves GLM models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with GLM.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function GLMUseCasePage() {
  return <UseCaseContent modelName="GLM" />;
}
