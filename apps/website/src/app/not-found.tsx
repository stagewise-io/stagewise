import Link from 'next/link';
import { Navbar } from './(home)/navbar';
import { Footer } from './(home)/_components/footer';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

export default function NotFound() {
  return (
    <ScrollReveal>
      <div className="flex min-h-screen flex-col items-center gap-12 bg-zinc-50 px-4 pt-64 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <Navbar />
        <main className="flex w-full max-w-3xl flex-1 flex-col items-center text-center">
          <h1 className="mb-4 font-bold text-4xl">
            Opps! You're in uncharted territory
          </h1>
          <Link
            href="/"
            className={buttonVariants({
              variant: 'primary',
              size: 'lg',
            })}
          >
            Go back home
          </Link>
        </main>
        <Footer />
      </div>
    </ScrollReveal>
  );
}
