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
    id: 'fire',
    name: 'Fire',
    description: 'Warm neutral surfaces with vivid orange accents.',
    baseHue: 85,
    baseChromaScale: 10,
    primaryHue: 25,
    primaryChromaScale: 0.75,
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
    baseChromaScale: 16.875,
    primaryHue: 0,
    primaryChromaScale: 0.8,
  },
  {
    id: 'titanium',
    name: 'Titanium',
    description: 'Warm titanium surfaces with minimal olive accents.',
    baseHue: 110,
    baseChromaScale: 1.5,
    primaryHue: 110,
    primaryChromaScale: 0.045,
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
