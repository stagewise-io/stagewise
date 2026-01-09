import { ScrollReveal } from '@/components/landing/scroll-reveal';
import TeamPic from './team-pic.jpg';
import Image from 'next/image';

export default function TeamPage() {
  return (
    <div className="relative mx-auto w-full max-w-6xl px-4 pb-16">
      <ScrollReveal>
        <div className="flex flex-col items-start gap-4 text-left">
          <h1 className="bg-gradient-to-br from-zinc-800 via-zinc-900 to-black bg-clip-text font-medium text-3xl text-transparent tracking-tight md:text-5xl dark:from-zinc-100 dark:via-zinc-300 dark:to-white">
            About our team
          </h1>
        </div>
      </ScrollReveal>

      <section className="mt-12">
        <div className="flex flex-col gap-8 md:flex-row md:gap-12">
          <ScrollReveal delay={300}>
            <div className="w-full shrink-0 scale-[1.02] transform overflow-hidden rounded-xl border border-zinc-900/50 shadow-[0_0_20px_rgba(0,0,0,0.15)] transition-transform duration-500 md:w-80 dark:border-zinc-100/50 dark:shadow-[0_0_20px_rgba(255,255,255,0.05)]">
              <Image
                src={TeamPic}
                alt="A picture of the two stagewise founders"
                quality={95}
                className="w-full"
              />
            </div>
          </ScrollReveal>

          <ScrollReveal delay={300}>
            <div className="dark:prose-invert prose max-w-none">
              <p>
                At its core, stagewise is the result of developers that are
                driven by a single goal: to build tools we love to use.
              </p>
              <p>
                We are{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.linkedin.com/in/glenntws/"
                >
                  Glenn
                </a>{' '}
                and{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.linkedin.com/in/juliangoetze/"
                >
                  Julian
                </a>
                , and we’ve built our team on a foundation of shared passion,
                complementary interests, and a relentless focus on solving
                real-world problems. This partnership allows us to move quickly,
                turning user feedback and new ideas into polished features at a
                rapid pace. We believe the best products come from a constant,
                open dialogue between product vision and technical strategy.
              </p>
              <h2>Our Story</h2>
              <p>
                Our journey as a team began at the{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.linkedin.com/company/founders-foundation-ggmbh/"
                >
                  Founders Foundation
                </a>{' '}
                in Germany, where we connected over a shared ambition to build
                better software. Our story wasn't a straight line to success. We
                first chased an idea that didn't work out at all, but we
                navigated that challenge together. That shared struggle was
                critical, because it led us to the insight that now defines
                stagewise.
              </p>
              <p>
                As we built prototypes for new ideas, we both felt the same
                frustration: the magical, high-speed experience of modern AI app
                building tools vanished once moving into a real-world codebase.
                We knew that there had to be a way to bring this visual
                experience into production-level projects - and we found one!
              </p>
              <p>
                Pooling our skills and teaming up with our friend{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://www.linkedin.com/in/nicklas-scharpff/"
                >
                  Nicklas
                </a>
                , we repurposed the technical developments we made with the
                previous venture idea and built an MVP to solve our own problem.
              </p>
              <p>
                The explosion of support on{' '}
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://github.com/stagewise-io/stagewise"
                >
                  GitHub
                </a>{' '}
                confirmed our shared belief:{' '}
                <strong>this was a universal pain point.</strong>
              </p>
              <p>
                This momentum, born from our collaborative effort, propelled us
                into Y Combinator's{' '}
                <a href="https://www.ycombinator.com/companies?batch=Summer%202025">
                  Summer 2025 batch
                </a>
                . Today, our teamwork is still the engine behind everything we
                do. We are dedicated to growing stagewise and empowering
                developers everywhere to build beautiful frontends without the
                friction we once faced.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}
