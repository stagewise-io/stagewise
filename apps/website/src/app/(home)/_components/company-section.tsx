import Image from 'next/image';
import Link from 'next/link';
import { IconArrowRightFill18 } from 'nucleo-ui-fill-18';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

import companyAbout from './feature-images/company-about.webp';

const OPEN_SOURCE_IMAGE_SIZES =
  '(min-width: 1280px) 560px, (min-width: 768px) 45vw, calc(100vw - 80px)';

export function CompanySection() {
  return (
    <section className="relative z-10 w-full py-10 md:py-16">
      <ScrollReveal>
        <div className="flex flex-col items-start justify-between gap-6 rounded-lg bg-surface-1 p-6 md:flex-row-reverse md:items-center md:gap-12">
          <div className="space-y-3">
            <h3 className="font-medium text-2xl">
              Building applied AI for a better future
            </h3>
            <p className="text-base text-muted-foreground">
              stagewise focuses on making artificial intelligence accessible to
              anyone by keeping cost low and putting great emphasis on a simple
              user experience.
            </p>
            <div className="my-6">
              <p className="mb-3 font-light text-muted-foreground text-sm">
                Backed by
              </p>
              <div className="flex flex-wrap items-center gap-5 opacity-40">
                <Image
                  src="/logos/yc-monochrome.svg"
                  alt="Y Combinator"
                  width={90}
                  height={24}
                  className="h-5 w-auto dark:invert"
                  unoptimized
                />
                <Image
                  src="/logos/twentytwo.webp"
                  alt="TwentyTwo Ventures"
                  width={80}
                  height={20}
                  className="h-4 w-auto dark:invert"
                />
                <Image
                  src="/logos/blast-monochrome.svg"
                  alt="Blast Club"
                  width={72}
                  height={20}
                  className="h-4 w-auto dark:invert"
                  unoptimized
                />
                <Image
                  src="/logos/teutoseedclub-monochrome.svg"
                  alt="Teuto Seed Club"
                  width={80}
                  height={20}
                  className="h-4 w-auto dark:invert"
                  unoptimized
                />
              </div>
            </div>
            <Link
              href="/company"
              className="inline-flex w-fit items-center gap-2 text-primary-foreground hover:text-hover-derived active:text-active-derived"
            >
              Learn more about us
              <IconArrowRightFill18 className="inline size-4" />
            </Link>
          </div>
          <div
            className="relative w-full shrink-0 overflow-hidden rounded-md ring-1 ring-surface-2 md:max-w-[45%]"
            style={{ aspectRatio: '4 / 3' }}
          >
            <Image
              src={companyAbout}
              className="absolute inset-0 h-full w-full object-contain"
              alt="AI for a better future"
              sizes={OPEN_SOURCE_IMAGE_SIZES}
              quality={80}
            />
          </div>
        </div>
      </ScrollReveal>
    </section>
  );
}
