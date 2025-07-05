import { AnimatedBackground } from '@/components/landing/animated-background';
import { ScrollReveal } from '@/components/landing/scroll-reveal';
import { CustomVideoPlayer } from '@/components/landing/custom-video-player';
import { WaitlistForm } from './_components/waitlist-form';
import { Suspense } from 'react';

export default function WaitlistPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-900 dark:bg-black dark:text-white">
      <AnimatedBackground />

      {/* Hero Section */}
      <section className="container relative z-10 mx-auto flex min-h-screen items-center justify-center p-16 px-4 md:p-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 md:grid-cols-2">
            {/* Left Column - Video Preview */}
            <ScrollReveal>
              <div className="flex flex-col items-center justify-center space-y-8">
                <h1 className="font-bold text-5xl tracking-tight md:text-6xl">
                  Early Access
                  <br />
                  to the
                  <br />
                  <span className="bg-gradient-to-tr from-blue-700 via-violet-500 to-indigo-800 bg-clip-text text-transparent dark:from-cyan-400 dark:via-violet-500 dark:to-indigo-400">
                    stagewise Agent
                  </span>
                </h1>
                {/* Video Preview Placeholder */}
                <div className="hidden aspect-video w-full rounded-xl border border-indigo-900/20 shadow-[0_0_40px_rgba(128,90,213,0.25)] md:block">
                  <CustomVideoPlayer
                    videoSrc="https://github.com/stagewise-io/assets/raw/24f1bbf1f75eb41be8076b40e2c1ada8676a97c7/edited/0-5-0-custom-agent/stagewise-custom-agent-demo.mp4"
                    thumbnailSrc="/agent-thumbnail.png"
                    alt="stagewise demo video"
                    width={1200}
                    height={675}
                    controls
                    muted={false}
                    loop={false}
                    preload="none"
                    playsInline
                  />
                </div>
              </div>
            </ScrollReveal>

            {/* Right Column - Sign Up Form */}
            <ScrollReveal delay={200}>
              <div className="group relative overflow-hidden rounded-xl border border-indigo-900/20 bg-gradient-to-br from-indigo-50 to-purple-50 p-8 shadow-[0_0_40px_rgba(128,90,213,0.25)] backdrop-blur-sm dark:from-indigo-950/30 dark:to-purple-950/30">
                <div className="-translate-x-full absolute inset-0 z-0 animate-shine bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform group-hover:animate-shine-fast" />
                <div className="relative z-10">
                  <Suspense fallback={<div>Loading form...</div>}>
                    <WaitlistForm />
                  </Suspense>
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal>
              <div className="aspect-video w-full rounded-xl border border-indigo-900/20 shadow-[0_0_40px_rgba(128,90,213,0.25)] md:hidden">
                <CustomVideoPlayer
                  videoSrc="https://github.com/stagewise-io/assets/raw/24f1bbf1f75eb41be8076b40e2c1ada8676a97c7/edited/0-5-0-custom-agent/stagewise-custom-agent-demo.mp4"
                  thumbnailSrc="/agent-thumbnail.png"
                  alt="stagewise demo video"
                  width={1200}
                  height={675}
                  controls
                  muted={false}
                  loop={false}
                  preload="none"
                  playsInline
                />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>
    </div>
  );
}
