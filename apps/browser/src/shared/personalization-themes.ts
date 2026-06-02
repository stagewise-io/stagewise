import type { PersonalizationThemeId } from './karton-contracts/ui/shared-types';

export type PersonalizationTheme = {
  id: PersonalizationThemeId;
  name: string;
  description: string;
  baseHue: number;
  baseChromaScale: number;
  primaryHue: number;
  primaryChromaScale: number;
};

export const PERSONALIZATION_THEMES: PersonalizationTheme[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Stagewise purple with warm neutrals.',
    baseHue: 85,
    baseChromaScale: 1,
    primaryHue: 265,
    primaryChromaScale: 1,
  },
  {
    id: 'lavender',
    name: 'Lavender',
    description: 'Soft lavender surfaces with gentle purple accents.',
    baseHue: 310,
    baseChromaScale: 4,
    primaryHue: 310,
    primaryChromaScale: 0.5,
  },
  {
    id: 'mint',
    name: 'Mint',
    description: 'Fresh mint surfaces with green primary accents.',
    baseHue: 175,
    baseChromaScale: 7.5,
    primaryHue: 160,
    primaryChromaScale: 0.7,
  },
  {
    id: 'sky',
    name: 'Sky',
    description: 'Airy blue surfaces with cool primary accents.',
    baseHue: 225,
    baseChromaScale: 3,
    primaryHue: 250,
    primaryChromaScale: 0.6,
  },
  {
    id: 'fire',
    name: 'Fire',
    description: 'Warm neutral surfaces with vivid orange accents.',
    baseHue: 85,
    baseChromaScale: 8,
    primaryHue: 30,
    primaryChromaScale: 1,
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Warm forest surfaces with green primary accents.',
    baseHue: 95,
    baseChromaScale: 6,
    primaryHue: 150,
    primaryChromaScale: 0.7,
  },
  {
    id: 'bubblegum',
    name: 'Bubblegum',
    description: 'Playful blue-tinted surfaces with pink accents.',
    baseHue: 260,
    baseChromaScale: 22.5,
    primaryHue: 340,
    primaryChromaScale: 0.4,
  },
];

export const DEFAULT_PERSONALIZATION_THEME =
  PERSONALIZATION_THEMES[0] as PersonalizationTheme;

export function getPersonalizationTheme(
  themeId: PersonalizationThemeId,
): PersonalizationTheme {
  return (
    PERSONALIZATION_THEMES.find((theme) => theme.id === themeId) ??
    DEFAULT_PERSONALIZATION_THEME
  );
}
