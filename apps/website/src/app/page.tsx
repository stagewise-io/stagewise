import { WebsiteDemo } from '@/components/website-demo';
import { ActionButtons } from '@/components/action-buttons';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Stagewise | Eyesight for AI code editors',
  description:
    'Stagewise enables coders to connect their AI code editor to your browser environment.',
};

export default function Home() {
  return (
    <div className="grid min-h-screen grid-rows-[20px_1fr_20px] items-center justify-items-center gap-16 p-8 pb-20 font-[family-name:var(--font-geist-sans)] sm:p-20">
      <main className="row-start-2 flex flex-col items-center gap-[32px] sm:items-start">
        <h1 className="text-balance font-bold text-6xl lg:text-8xl">
          Eyesight for your AI code editor
        </h1>
        <ActionButtons />
        <WebsiteDemo />
      </main>
    </div>
  );
}
