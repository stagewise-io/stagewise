import Link from 'next/link';
import Image from 'next/image';
import { Fraunces } from 'next/font/google';
import { buttonVariants } from '@stagewise/stage-ui/components/button';
import { cn } from '@stagewise/stage-ui/lib/utils';
import { IconArrowRightFill18 } from '@stagewise/icons';

import klexWink from './klex-wink.webp';

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  axes: ['SOFT', 'WONK', 'opsz'],
});

export function KlexBanner() {
  return (
    <section className="relative z-10 w-full pb-10 md:pb-12">
      <div className="rounded-2xl border border-border-subtle bg-surface-1 p-4 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col items-start gap-3">
            <div className="flex flex-col gap-1 md:max-w-2xl">
              <h2
                style={{
                  fontWeight: 500,
                  fontOpticalSizing: 'none',
                  fontVariationSettings: "'WONK' 0",
                }}
                className={cn(
                  fraunces.className,
                  'text-xl tracking-tight md:text-2xl',
                )}
              >
                Say Hello to Klex Bots
              </h2>
              <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
                The stagewise team is now building the digital coworker of the
                future. Klex Bots take coding tasks end-to-end — from first plan
                to merged PR — with their own identity, right in the tools you
                already use. And yes — they're open source!
              </p>
            </div>

            <div className="flex w-full items-center justify-between gap-4">
              <div className="flex flex-col items-start gap-2 pt-1 sm:flex-row sm:items-center sm:gap-3">
                <a
                  href="https://klex.bot"
                  className={cn(
                    buttonVariants({ size: 'sm', variant: 'primary' }),
                  )}
                >
                  Go to Klex Bots
                  <IconArrowRightFill18 className="inline size-4" />
                </a>
                <Link
                  href="/news/say-hello-to-klex-bots"
                  className={cn(
                    buttonVariants({ size: 'sm', variant: 'ghost' }),
                  )}
                >
                  The story behind Klex Bots
                  <IconArrowRightFill18 className="inline size-4" />
                </Link>
              </div>

              {/* Phone layout: image sits right of the buttons */}
              <Image
                src={klexWink}
                alt="Klex Bot"
                className="h-auto w-28 shrink-0 sm:w-32 md:hidden"
              />
            </div>
          </div>

          <Image
            src={klexWink}
            alt="Klex Bot"
            className="hidden h-auto w-48 md:block lg:w-56"
          />
        </div>
      </div>
    </section>
  );
}
