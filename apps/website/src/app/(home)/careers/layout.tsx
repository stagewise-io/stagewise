import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Career · stagewise',
  description:
    'Join stagewise and help build the future of AI-driven development. We are hiring in-person in San Francisco and Bielefeld.',
  openGraph: {
    title: 'Career · stagewise',
    description:
      'Join stagewise and help build the future of AI-driven development. We are hiring in-person in San Francisco and Bielefeld.',
    type: 'website',
  },
  twitter: {
    title: 'Career · stagewise',
    description:
      'Join stagewise and help build the future of AI-driven development. We are hiring in-person in San Francisco and Bielefeld.',
    creator: '@stagewise_io',
  },
  category: 'technology',
};

export default function CareerLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
