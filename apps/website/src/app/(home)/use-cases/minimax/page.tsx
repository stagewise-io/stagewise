import type { Metadata } from 'next';
import { UseCaseContent } from '../_components/use-case-content';

export const metadata: Metadata = {
  title: 'An Open-Source Agentic IDE for MiniMax · stagewise',
  description:
    'stagewise is a frontier-grade harness that maximizes the power of MiniMax and serves MiniMax models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with MiniMax.',
  openGraph: {
    title: 'An Open-Source Agentic IDE for MiniMax · stagewise',
    description:
      'stagewise is a frontier-grade harness that maximizes the power of MiniMax and serves MiniMax models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with MiniMax.',
    type: 'website',
  },
  twitter: {
    title: 'An Open-Source Agentic IDE for MiniMax · stagewise',
    description:
      'stagewise is a frontier-grade harness that maximizes the power of MiniMax and serves MiniMax models either via the stagewise Account, your existing subscriptions or your API keys. Get a first class coding experience with MiniMax.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function MiniMaxUseCasePage() {
  return <UseCaseContent modelName="MiniMax" />;
}
