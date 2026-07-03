import Image from 'next/image';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { DownloadButtons } from './download-buttons';
import { GithubStarButton } from './github-star-button';

import fullDemoDark from './feature-images/full-demo-dark.webp';
import fullDemoLight from './feature-images/full-demo-light.webp';
import bgDark from './feature-images/bg-dark.jpg';
import bgLight from './feature-images/bg-light.jpg';

async function getGithubStarCount(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.github.com/repos/stagewise-io/stagewise',
      { next: { revalidate: 3600 } },
    );
    if (response.ok) {
      const data = await response.json();
      return data.stargazers_count as number;
    }
  } catch {
    // fall through to fallback
  }
  return 4300;
}

const HERO_IMAGE_SIZES = '(min-width: 1280px) 1216px, calc(100vw - 32px)';

export async function HeroSection() {
  const starCount = await getGithubStarCount();
  return (
    <section className="relative z-10 w-full pb-4 md:pb-6">
      <div className="flex justify-start">
        <div className="w-full max-w-7xl">
          <ScrollReveal>
            <div className="mt-0 mb-6 flex flex-col items-start text-left md:mt-2 md:mb-8">
              <h1 className="mb-4 font-medium text-3xl tracking-tight md:text-5xl">
                <span className="text-foreground">
                  The Agentic IDE for Open-Source Models
                </span>
              </h1>
              <span className="mb-8 text-lg text-muted-foreground leading-relaxed">
                stagewise is a next-gen agent orchestrator for software
                engineers, leveraging our frontier-grade agent harness.
                <br />
                Full model sovereignty. Runs locally, connects to anything.
              </span>

              <div className="mb-6 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <DownloadButtons />
                <GithubStarButton starCount={starCount} />
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={300}>
            <div className="relative mt-6 mb-6 flex w-full items-center justify-center overflow-hidden rounded-2xl p-6 ring-1 ring-surface-2 md:mt-8 md:p-10">
              <Image
                src={bgLight}
                alt=""
                className="absolute inset-0 h-full w-full object-cover dark:hidden"
                sizes={HERO_IMAGE_SIZES}
                quality={70}
                priority
              />
              <Image
                src={bgDark}
                alt=""
                className="absolute inset-0 hidden h-full w-full object-cover dark:block"
                sizes={HERO_IMAGE_SIZES}
                quality={70}
                priority
              />
              <Image
                src={fullDemoLight}
                alt="stagewise full product overview"
                className="relative z-10 block h-full dark:hidden"
                sizes={HERO_IMAGE_SIZES}
                quality={85}
                priority
              />
              <Image
                src={fullDemoDark}
                alt="stagewise full product overview"
                className="relative z-10 hidden h-full dark:block"
                sizes={HERO_IMAGE_SIZES}
                quality={85}
                priority
              />
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
