import type { ReactNode } from 'react';
import { Navbar } from './navbar';
import { Footer } from './_components/footer';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center gap-12 bg-zinc-50 pt-32 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
