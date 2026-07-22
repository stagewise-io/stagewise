import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  state: {
    globalConfig: {
      personalizationThemeId: 'default',
      notificationSoundLoudness: 'subtle',
      notificationSoundPack: 'bubble-pops',
    },
    notificationSoundPacks: {
      available: ['bubble-pops', 'chimes'],
      displayNames: {},
    },
  },
  setGlobalConfig: vi.fn(),
  previewSoundPack: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@ui/hooks/use-karton', () => ({
  useKartonState: (selector: (state: typeof mocks.state) => unknown) =>
    selector(mocks.state),
  useKartonProcedure: (selector: (procedures: unknown) => unknown) =>
    selector({
      config: {
        set: mocks.setGlobalConfig,
        previewSoundPack: mocks.previewSoundPack,
      },
    }),
}));
vi.mock('@ui/hooks/use-track', () => ({ useTrack: () => mocks.track }));

import { useSoundSettings } from './use-sound-settings';
import { useThemeSelection } from './use-theme-selection';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('personalization change handlers', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.setGlobalConfig.mockReset().mockResolvedValue(undefined);
    mocks.previewSoundPack.mockReset().mockResolvedValue(undefined);
    mocks.track.mockReset().mockResolvedValue(undefined);
  });

  it('reports only distinct successfully persisted theme changes', async () => {
    const { result } = renderHook(() => useThemeSelection());

    await expect(result.current.handleThemeChange('default')).resolves.toBe(
      false,
    );
    expect(mocks.setGlobalConfig).not.toHaveBeenCalled();

    let changed = false;
    await act(async () => {
      changed = await result.current.handleThemeChange('fire');
    });
    expect(changed).toBe(true);
    expect(mocks.setGlobalConfig).toHaveBeenCalledWith({
      personalizationThemeId: 'fire',
    });

    mocks.setGlobalConfig.mockRejectedValueOnce(new Error('save failed'));
    await act(async () => {
      changed = await result.current.handleThemeChange('forest');
    });
    expect(changed).toBe(false);

    mocks.track.mockRejectedValueOnce(new Error('tracking failed'));
    await act(async () => {
      changed = await result.current.handleThemeChange('forest');
    });
    expect(changed).toBe(true);
  });

  it('serializes theme saves and reports only the latest request', async () => {
    const firstSave = deferred();
    mocks.setGlobalConfig
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useThemeSelection());

    let firstResult!: boolean;
    let secondResult!: boolean;
    await act(async () => {
      const first = result.current
        .handleThemeChange('fire')
        .then((value) => (firstResult = value));
      const second = result.current
        .handleThemeChange('forest')
        .then((value) => (secondResult = value));

      await vi.waitFor(() =>
        expect(mocks.setGlobalConfig).toHaveBeenCalledTimes(1),
      );
      firstSave.resolve();
      await Promise.all([first, second]);
    });

    expect(mocks.setGlobalConfig.mock.calls).toEqual([
      [{ personalizationThemeId: 'fire' }],
      [{ personalizationThemeId: 'forest' }],
    ]);
    expect(firstResult).toBe(false);
    expect(secondResult).toBe(true);
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith('changed-theme', {
      theme: 'forest',
    });
  });

  it('reports only distinct successfully persisted sound changes', async () => {
    const { result } = renderHook(() => useSoundSettings());

    await expect(result.current.handleLoudnessChange(1)).resolves.toBe(false);
    await expect(
      result.current.handleSoundPackChange('bubble-pops'),
    ).resolves.toBe(false);
    expect(mocks.setGlobalConfig).not.toHaveBeenCalled();

    await expect(result.current.handleLoudnessChange(2)).resolves.toBe(true);
    await expect(result.current.handleSoundPackChange('chimes')).resolves.toBe(
      true,
    );

    mocks.setGlobalConfig.mockRejectedValueOnce(new Error('save failed'));
    await act(async () => {
      await expect(result.current.handleLoudnessChange(0)).resolves.toBe(false);
    });

    mocks.track.mockRejectedValueOnce(new Error('tracking failed'));
    await act(async () => {
      await expect(result.current.handleLoudnessChange(0)).resolves.toBe(true);
    });

    mocks.track.mockRejectedValueOnce(new Error('tracking failed'));
    await act(async () => {
      await expect(
        result.current.handleSoundPackChange('chimes'),
      ).resolves.toBe(true);
    });
  });

  it('serializes sound saves and reports only the latest field request', async () => {
    const firstSave = deferred();
    mocks.setGlobalConfig
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useSoundSettings());

    let firstResult!: boolean;
    let secondResult!: boolean;
    await act(async () => {
      const first = result.current
        .handleLoudnessChange(2)
        .then((value) => (firstResult = value));
      const second = result.current
        .handleLoudnessChange(0)
        .then((value) => (secondResult = value));

      await vi.waitFor(() =>
        expect(mocks.setGlobalConfig).toHaveBeenCalledTimes(1),
      );
      firstSave.resolve();
      await Promise.all([first, second]);
    });

    expect(mocks.setGlobalConfig.mock.calls).toEqual([
      [{ notificationSoundLoudness: 'default' }],
      [{ notificationSoundLoudness: 'off' }],
    ]);
    expect(firstResult).toBe(false);
    expect(secondResult).toBe(true);
    expect(mocks.track).toHaveBeenCalledOnce();
    expect(mocks.track).toHaveBeenCalledWith(
      'changed-notification-sound-loudness',
      { loudness: 'off' },
    );
  });
});
