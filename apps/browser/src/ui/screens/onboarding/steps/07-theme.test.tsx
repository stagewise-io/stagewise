import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handleThemeChange: vi.fn(),
  handleSoundPackChange: vi.fn(),
  handleLoudnessChange: vi.fn(),
}));

vi.mock('@ui/hooks/use-karton', () => ({
  useKartonState: vi.fn(),
  useKartonProcedure: vi.fn(),
}));
vi.mock('@ui/hooks/use-track', () => ({ useTrack: () => vi.fn() }));
vi.mock('@ui/utils', () => ({
  cn: (...values: unknown[]) => values.filter(Boolean).join(' '),
}));
vi.mock('@ui/hooks/use-theme-selection', () => ({
  useThemeSelection: () => ({
    currentThemeId: 'default',
    handleThemeChange: mocks.handleThemeChange,
  }),
}));
vi.mock('@ui/hooks/use-sound-settings', () => ({
  NOTIFICATION_LOUDNESS_OPTIONS: [
    { value: 'off', label: 'Off' },
    { value: 'subtle', label: 'Subtle' },
    { value: 'full', label: 'Full' },
  ],
  useSoundSettings: () => ({
    soundLoudness: 'subtle',
    currentPack: 'bubble-pops',
    soundPackItems: [
      { value: 'bubble-pops', label: 'Bubble Pops' },
      { value: 'chimes', label: 'Chimes' },
    ],
    loudnessIndex: 1,
    previewSound: vi.fn(),
    handleLoudnessChange: mocks.handleLoudnessChange,
    handleSoundPackChange: mocks.handleSoundPackChange,
  }),
}));
vi.mock('@ui/components/theme-badge', () => ({
  ThemeBadge: ({ name }: { name: string }) => <span>{name}</span>,
}));
vi.mock('@shared/personalization-themes', () => ({
  PERSONALIZATION_THEMES: [
    { id: 'default', name: 'Default' },
    { id: 'fire', name: 'Fire' },
  ],
}));
vi.mock('@stagewise/stage-ui/components/overlay-scrollbar', () => ({
  OverlayScrollbar: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@stagewise/stage-ui/components/select', () => ({
  Select: ({ onValueChange }: { onValueChange: (value: string) => void }) => (
    <button type="button" onClick={() => onValueChange('chimes')}>
      Change sound pack
    </button>
  ),
}));
vi.mock('@stagewise/stage-ui/components/slider', () => ({
  Slider: ({ onValueChange }: { onValueChange: (value: number) => void }) => (
    <button type="button" onClick={() => onValueChange(2)}>
      Change loudness
    </button>
  ),
}));

import { StepTheme } from './07-theme';

function deferredBoolean() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderStep() {
  const onNext = vi.fn();
  const onPersonalizationChanged = vi.fn();
  render(
    <StepTheme
      onNext={onNext}
      onBack={vi.fn()}
      onPersonalizationChanged={onPersonalizationChanged}
    />,
  );
  return { onNext, onPersonalizationChanged };
}

describe('StepTheme completion gating', () => {
  beforeEach(() => {
    mocks.handleThemeChange.mockReset().mockResolvedValue(false);
    mocks.handleSoundPackChange.mockReset().mockResolvedValue(false);
    mocks.handleLoudnessChange.mockReset().mockResolvedValue(false);
  });

  it('blocks Finish until a successful theme write settles', async () => {
    const mutation = deferredBoolean();
    mocks.handleThemeChange.mockReturnValue(mutation.promise);
    const callbacks = renderStep();

    fireEvent.click(screen.getByRole('radio', { name: 'Use Fire theme' }));
    const finish = screen.getByRole('button', { name: 'Finish' });
    expect(finish.hasAttribute('disabled')).toBe(true);
    fireEvent.click(finish);
    expect(callbacks.onNext).not.toHaveBeenCalled();

    await act(async () => mutation.resolve(true));

    expect(finish.hasAttribute('disabled')).toBe(false);
    expect(callbacks.onPersonalizationChanged).toHaveBeenCalledOnce();
    fireEvent.click(finish);
    expect(callbacks.onNext).toHaveBeenCalledOnce();
  });

  it('gates sound writes without marking failed or no-op changes', async () => {
    const mutation = deferredBoolean();
    mocks.handleSoundPackChange.mockReturnValue(mutation.promise);
    const callbacks = renderStep();

    fireEvent.click(screen.getByRole('button', { name: 'Change sound pack' }));
    expect(
      screen.getByRole('button', { name: 'Finish' }).hasAttribute('disabled'),
    ).toBe(true);
    await act(async () => mutation.resolve(false));

    expect(callbacks.onPersonalizationChanged).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Change loudness' }));
    await act(async () => {});
    expect(callbacks.onPersonalizationChanged).not.toHaveBeenCalled();
  });
});
