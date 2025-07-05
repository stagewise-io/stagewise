'use client';

import Link from 'next/link';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useFeatureFlagVariantKey, usePostHog } from 'posthog-js/react';

export const copyA = {
  title: 'A 10x Faster Frontend Agent is Coming. The stagewise agent.',
  button: 'Get Early Access',
};

export const copyB = {
  title: 'Build outstanding UI in seconds with the new stagewise agent.',
  button: 'Get Early Access',
};

export const copyC = {
  title:
    'The native stagewise frontend agent is coming: 10x faster, seamlessly integrated.',
  button: 'Get Early Access',
};

export function WaitlistBanner() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const bannerRef = useRef<HTMLDivElement>(null);
  const posthog = usePostHog();

  // Use PostHog's native feature flag
  const variant = useFeatureFlagVariantKey('waitlist-banner-conversion');

  // Add spring physics to the mouse tracking for smoother animation
  const springMouseX = useSpring(mouseX, {
    stiffness: 150,
    damping: 25,
    mass: 0.1,
  });
  const springMouseY = useSpring(mouseY, {
    stiffness: 150,
    damping: 25,
    mass: 0.1,
  });

  const rotateX = useTransform(springMouseY, [-300, 300], [8, -8]);
  const rotateY = useTransform(springMouseX, [-300, 300], [-2, 2]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const rect = bannerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const newMouseX = e.clientX - centerX;
      const newMouseY = e.clientY - centerY;

      mouseX.set(newMouseX);
      mouseY.set(newMouseY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  // Track banner view when component mounts
  useEffect(() => {
    if (variant && posthog) {
      posthog.capture('waitlist_banner_viewed', {
        $feature_flag: 'waitlist-banner-conversion',
        $feature_flag_response: variant,
        copy_title: getCopyForVariant(variant).title,
      });
    }
  }, [variant, posthog]);

  // Get copy based on variant
  const getCopyForVariant = (variant: string | boolean | undefined) => {
    if (typeof variant === 'string') {
      switch (variant) {
        case 'control':
        case 'variant-a':
          return copyA;
        case 'variant-b':
          return copyB;
        case 'variant-c':
          return copyC;
        default:
          return copyA;
      }
    }
    return copyA;
  };

  const handleButtonClick = () => {
    if (posthog) {
      posthog.capture('waitlist_banner_clicked', {
        $feature_flag: 'waitlist-banner-conversion',
        $feature_flag_response: variant,
        copy_title: getCopyForVariant(variant).title,
        button_text: getCopyForVariant(variant).button,
      });
    }
  };

  // Don't render until we have the variant
  if (variant === undefined) {
    return null;
  }

  const copy = getCopyForVariant(variant);

  return (
    <div className="-translate-x-1/2 fixed top-14 left-1/2 z-50 mt-4 w-[95%] max-w-[1400px] lg:w-auto">
      <div className="relative">
        <motion.div
          ref={bannerRef}
          className="group relative flex h-auto min-h-[3rem] items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-gradient-to-r from-blue-600/50 to-violet-600/50 p-2 shadow-blue-500/20 shadow-lg backdrop-blur-xl backdrop-saturate-150 before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-r before:from-white/10 before:to-transparent sm:h-12 sm:p-4 dark:from-blue-900/50 dark:to-violet-900/50 dark:shadow-violet-500/20"
          style={{
            rotateX: rotateX,
            rotateY: rotateY,
            transformPerspective: 1000,
            transformStyle: 'preserve-3d',
          }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="-translate-x-full absolute inset-0 z-10 animate-shine bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform" />
          <div className="relative z-20 flex w-full flex-col items-center justify-center gap-2 sm:flex-row sm:justify-evenly sm:gap-8">
            <span className="text-center text-sm text-white drop-shadow-sm sm:text-left">
              {copy.title}
            </span>
            <Link
              href="/waitlist"
              onClick={handleButtonClick}
              className="group/button relative overflow-hidden rounded-lg border border-white/30 bg-purple-600/20 px-3 py-1 font-medium text-sm text-white backdrop-blur-sm transition-all hover:border-white/40 hover:bg-white/30"
            >
              <span className="-translate-x-full absolute inset-0 animate-button-shine bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform" />
              <span className="relative drop-shadow-sm">{copy.button}</span>
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
