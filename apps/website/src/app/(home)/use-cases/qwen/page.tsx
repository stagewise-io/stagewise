import type { Metadata } from 'next';
import { UseCaseContent } from '../_components/use-case-content';

export const metadata: Metadata = {
  title: 'An Open-Source Agentic IDE for Qwen · stagewise',
  description:
    'stagewise is a frontier-grade harness that maximizes the power of Qwen and serves Qwen models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with Qwen.',
  openGraph: {
    title: 'An Open-Source Agentic IDE for Qwen · stagewise',
    description:
      'stagewise is a frontier-grade harness that maximizes the power of Qwen and serves Qwen models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with Qwen.',
    type: 'website',
  },
  twitter: {
    title: 'An Open-Source Agentic IDE for Qwen · stagewise',
    description:
      'stagewise is a frontier-grade harness that maximizes the power of Qwen and serves Qwen models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with Qwen.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function QwenUseCasePage() {
  return <UseCaseContent modelName="Qwen" />;
}
