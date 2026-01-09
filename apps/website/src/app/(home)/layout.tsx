import type { ReactNode } from 'react';
import { Navbar } from './navbar';
import { Footer } from './_components/footer';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center gap-12 bg-background pt-32 text-foreground">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
