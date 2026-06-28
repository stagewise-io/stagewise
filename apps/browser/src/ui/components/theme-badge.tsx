import { cn } from '@stagewise/stage-ui/lib/utils';
import { getPersonalizationTheme } from '@shared/personalization-themes';
import type { PersonalizationThemeId } from '@shared/karton-contracts/ui/shared-types';

export function baseColor(
  lightness: number,
  chroma: number,
  themeId: PersonalizationThemeId,
  alpha?: number,
) {
  const theme = getPersonalizationTheme(themeId);
  return `oklch(${lightness} ${chroma * theme.baseChromaScale} ${
    theme.baseHue
  }${alpha === undefined ? '' : ` / ${alpha}`})`;
}

export function primaryColor(
  lightness: number,
  chroma: number,
  themeId: PersonalizationThemeId,
  alpha?: number,
) {
  const theme = getPersonalizationTheme(themeId);
  return `oklch(${lightness} ${chroma * theme.primaryChromaScale} ${
    theme.primaryHue
  }${alpha === undefined ? '' : ` / ${alpha}`})`;
}

const FIRE_BADGE_PATTERN_MASK_IMAGE =
  "url(\"data:image/svg+xml,%3Csvg width='48' height='32' viewBox='0 0 48 32' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.4'%3E%3Cpath d='M27 32c0-3.314 2.686-6 6-6 5.523 0 10-4.477 10-10S38.523 6 33 6c-3.314 0-6-2.686-6-6h2c0 2.21 1.79 4 4 4 6.627 0 12 5.373 12 12s-5.373 12-12 12c-2.21 0-4 1.79-4 4h-2zm-6 0c0-3.314-2.686-6-6-6-5.523 0-10-4.477-10-10S9.477 6 15 6c3.314 0 6-2.686 6-6h-2c0 2.21-1.79 4-4 4C8.373 4 3 9.373 3 16s5.373 12 12 12c2.21 0 4 1.79 4 4h2z' /%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")";

const BUBBLEGUM_BADGE_PATTERN_MASK_IMAGE =
  "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23000000' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E\")";

const FOREST_BADGE_PATTERN_MASK_IMAGE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 40' width='80' height='40'%3E%3Cpath fill='%23000000' fill-opacity='0.4' d='M0 40a19.96 19.96 0 0 1 5.9-14.11 20.17 20.17 0 0 1 19.44-5.2A20 20 0 0 1 20.2 40H0zM65.32.75A20.02 20.02 0 0 1 40.8 25.26 20.02 20.02 0 0 1 65.32.76zM.07 0h20.1l-.08.07A20.02 20.02 0 0 1 .75 5.25 20.08 20.08 0 0 1 .07 0zm1.94 40h2.53l4.26-4.24v-9.78A17.96 17.96 0 0 0 2 40zm5.38 0h9.8a17.98 17.98 0 0 0 6.67-16.42L7.4 40zm3.43-15.42v9.17l11.62-11.59c-3.97-.5-8.08.3-11.62 2.42zm32.86-.78A18 18 0 0 0 63.85 3.63L43.68 23.8zm7.2-19.17v9.15L62.43 2.22c-3.96-.5-8.05.3-11.57 2.4zm-3.49 2.72c-4.1 4.1-5.81 9.69-5.13 15.03l6.61-6.6V6.02c-.51.41-1 .85-1.48 1.33zM17.18 0H7.42L3.64 3.78A18 18 0 0 0 17.18 0zM2.08 0c-.01.8.04 1.58.14 2.37L4.59 0H2.07z'%3E%3C/path%3E%3C/svg%3E\")";

const TITANIUM_BADGE_PATTERN_MASK_IMAGE =
  "url(\"data:image/svg+xml,%3Csvg width='16' height='20' viewBox='0 0 16 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23000000' fill-opacity='0.4' fill-rule='evenodd'%3E%3Cpath d='M8 0v20L0 10M16 0v10L8 0M16 10v10H8'/%3E%3C/g%3E%3C/svg%3E\")";

const THEME_BADGE_PATTERN_BY_THEME: Partial<
  Record<PersonalizationThemeId, { image: string; size: string }>
> = {
  bubblegum: {
    image: BUBBLEGUM_BADGE_PATTERN_MASK_IMAGE,
    size: '50px 50px',
  },
  fire: {
    image: FIRE_BADGE_PATTERN_MASK_IMAGE,
    size: '28.8px 19.2px',
  },
  forest: {
    image: FOREST_BADGE_PATTERN_MASK_IMAGE,
    size: '40px 20px',
  },
  titanium: {
    image: TITANIUM_BADGE_PATTERN_MASK_IMAGE,
    size: '16px 20px',
  },
};

export function ThemeBadge({
  themeId,
  name,
  active,
}: {
  themeId: PersonalizationThemeId;
  name: string;
  active: boolean;
}) {
  const badgePattern = THEME_BADGE_PATTERN_BY_THEME[themeId];

  return (
    <span
      className={cn(
        'group relative flex h-16 w-32 shrink-0 items-start justify-end overflow-hidden rounded-xl p-2 ring-1 ring-muted-foreground/20 transition-opacity duration-150 ease-out',
        active
          ? 'opacity-100 ring-foreground/30'
          : 'opacity-60 hover:opacity-80',
      )}
    >
      <span
        className="absolute inset-0 rounded-lg dark:opacity-0"
        style={{
          backgroundColor: baseColor(0.94, 0.002, themeId),
        }}
      />
      <span
        className="absolute inset-0 rounded-lg opacity-0 dark:opacity-100"
        style={{
          backgroundColor: baseColor(0.3, 0.0015, themeId),
        }}
      />
      {badgePattern && (
        <>
          <span
            className={cn(
              'absolute inset-0 rounded-lg transition-opacity duration-150 ease-out',
              active
                ? 'opacity-100 dark:opacity-0'
                : 'opacity-20 group-hover:opacity-80 dark:opacity-0 dark:group-hover:opacity-0',
            )}
            style={{
              backgroundColor: primaryColor(0.86, 0.1, themeId),
              maskImage: badgePattern.image,
              maskRepeat: 'repeat',
              maskSize: badgePattern.size,
              WebkitMaskImage: badgePattern.image,
              WebkitMaskRepeat: 'repeat',
              WebkitMaskSize: badgePattern.size,
            }}
          />
          <span
            className={cn(
              'absolute inset-0 rounded-lg transition-opacity duration-150 ease-out',
              active
                ? 'opacity-0 dark:opacity-100'
                : 'opacity-0 group-hover:opacity-0 dark:opacity-20 dark:group-hover:opacity-80',
            )}
            style={{
              backgroundColor: primaryColor(0.38, 0.05, themeId),
              maskImage: badgePattern.image,
              maskRepeat: 'repeat',
              maskSize: badgePattern.size,
              WebkitMaskImage: badgePattern.image,
              WebkitMaskRepeat: 'repeat',
              WebkitMaskSize: badgePattern.size,
            }}
          />
        </>
      )}
      <span
        className="absolute -top-1/2 -left-1/2 h-[200%] w-30 rounded-full dark:opacity-0"
        style={{
          background: `linear-gradient(to bottom left, ${primaryColor(
            0.49,
            0.22,
            themeId,
          )}, ${primaryColor(0.7, 0.18, themeId)})`,
          filter: 'blur(20px)',
        }}
      />
      <span
        className="absolute -top-1/2 -left-1/2 h-[200%] w-30 opacity-0 dark:opacity-80"
        style={{
          background: `linear-gradient(to bottom left, ${primaryColor(
            0.49,
            0.22,
            themeId,
          )}, ${primaryColor(0.65, 0.18, themeId)})`,
          filter: 'blur(28px)',
        }}
      />
      <span
        className="relative z-10 max-w-20 truncate text-right font-normal text-foreground text-sm"
        style={{
          textShadow: `0 0 2px ${baseColor(0.92, 0.002, themeId, 0.5)}`,
        }}
      >
        {name}
      </span>
    </span>
  );
}
