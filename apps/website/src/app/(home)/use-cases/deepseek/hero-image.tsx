import Image from 'next/image';

export function HeroImage() {
  return (
    <div
      className="relative w-full overflow-hidden rounded-2xl bg-surface-1 ring-1 ring-surface-2"
      style={{ aspectRatio: '21 / 9' }}
    >
      {/* Decorative topography background */}
      <div
        className="absolute inset-0 z-0 opacity-[0.03] dark:opacity-[0.04]"
        style={{
          backgroundColor: 'var(--color-foreground)',
          WebkitMaskImage: 'url(/patterns/topography.svg)',
          maskImage: 'url(/patterns/topography.svg)',
          WebkitMaskRepeat: 'repeat',
          maskRepeat: 'repeat',
          WebkitMaskSize: '600px',
          maskSize: '600px',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      />

      {/* Logos + heart */}
      <div className="absolute inset-0 z-10 flex items-center justify-center gap-6 px-4 md:gap-12">
        {/* stagewise logo */}
        <Image
          src="/logo-with-text.svg"
          alt="stagewise"
          width={220}
          height={45}
          className="h-9 w-auto shrink-0 md:h-12 dark:hidden"
          priority
        />
        <Image
          src="/logo-with-text-white.svg"
          alt="stagewise"
          width={220}
          height={45}
          className="hidden h-9 w-auto shrink-0 md:h-12 dark:block"
          priority
        />

        {/* Heart */}
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 shrink-0 text-red-500 md:h-8 md:w-8"
          fill="currentColor"
          aria-label="love"
        >
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>

        {/* DeepSeek logo */}
        <Image
          src="/icons/deepseek.png"
          alt="DeepSeek"
          width={48}
          height={48}
          className="h-14 w-auto shrink-0 md:h-20"
        />
      </div>
    </div>
  );
}
