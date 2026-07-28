import { useRef } from 'react';
import { useKartonState, useKartonProcedure } from '@ui/hooks/use-karton';
import { useTrack } from '@ui/hooks/use-track';

const DEFAULT_SOUND_PACK = 'bubble-pops';
const NOTIFICATION_LOUDNESS_OPTIONS = [
  { value: 'off', label: 'Off' },
  { value: 'subtle', label: 'Subtle' },
  { value: 'default', label: 'Loud' },
] as const;

type SoundLoudness = (typeof NOTIFICATION_LOUDNESS_OPTIONS)[number]['value'];

export {
  DEFAULT_SOUND_PACK,
  NOTIFICATION_LOUDNESS_OPTIONS,
  type SoundLoudness,
};

/**
 * Shared state management for notification sound settings.
 * Used by both the onboarding theme step and the settings general section
 * to avoid drift in sound pack / loudness save behavior.
 */
export function useSoundSettings() {
  const globalConfig = useKartonState((s) => s.globalConfig);
  const soundPacks = useKartonState((s) => s.notificationSoundPacks);
  const setGlobalConfig = useKartonProcedure((p) => p.config.set);
  const previewSoundPack = useKartonProcedure((p) => p.config.previewSoundPack);
  const track = useTrack();
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestLoudnessRequestIdRef = useRef(0);
  const latestSoundPackRequestIdRef = useRef(0);

  const soundLoudness: SoundLoudness =
    globalConfig.notificationSoundLoudness ?? 'subtle';
  const availablePacks =
    soundPacks.available.length > 0
      ? soundPacks.available
      : [DEFAULT_SOUND_PACK];
  const configuredPack = globalConfig.notificationSoundPack?.trim();
  const currentPack =
    configuredPack && availablePacks.includes(configuredPack)
      ? configuredPack
      : DEFAULT_SOUND_PACK;
  const packOptions = availablePacks.includes(currentPack)
    ? availablePacks
    : [currentPack, ...availablePacks];
  const loudnessIndex = Math.max(
    0,
    NOTIFICATION_LOUDNESS_OPTIONS.findIndex(
      (option) => option.value === soundLoudness,
    ),
  );

  const soundPackItems = packOptions.map((pack) => ({
    value: pack,
    label: soundPacks.displayNames[pack] ?? pack,
  }));

  const previewSound = (pack = currentPack, loudness = soundLoudness) => {
    if (loudness === 'off') return;
    void previewSoundPack(pack, loudness).catch(() => {});
  };

  const handleLoudnessChange = async (value: number) => {
    const index = Math.max(
      0,
      Math.min(NOTIFICATION_LOUDNESS_OPTIONS.length - 1, Math.round(value)),
    );
    const notificationSoundLoudness =
      NOTIFICATION_LOUDNESS_OPTIONS[index]?.value ?? 'subtle';
    if (notificationSoundLoudness === soundLoudness) return false;

    previewSound(currentPack, notificationSoundLoudness);
    const requestId = latestLoudnessRequestIdRef.current + 1;
    latestLoudnessRequestIdRef.current = requestId;
    const save = saveQueueRef.current.then(() =>
      setGlobalConfig({
        notificationSoundLoudness,
      }),
    );
    saveQueueRef.current = save.catch(() => {});

    try {
      await save;
    } catch (error) {
      console.error('Failed to save sound loudness', error);
      return false;
    }

    if (latestLoudnessRequestIdRef.current !== requestId) return false;

    void track('changed-notification-sound-loudness', {
      loudness: notificationSoundLoudness,
    }).catch((error) => {
      console.error('Failed to track sound loudness change', error);
    });
    return true;
  };

  const handleSoundPackChange = async (value: unknown) => {
    if (
      typeof value !== 'string' ||
      !packOptions.includes(value) ||
      value === currentPack
    ) {
      return false;
    }
    previewSound(value, soundLoudness);
    const requestId = latestSoundPackRequestIdRef.current + 1;
    latestSoundPackRequestIdRef.current = requestId;
    const save = saveQueueRef.current.then(() =>
      setGlobalConfig({
        notificationSoundPack: value,
      }),
    );
    saveQueueRef.current = save.catch(() => {});

    try {
      await save;
    } catch (error) {
      console.error('Failed to save sound pack', error);
      return false;
    }

    if (latestSoundPackRequestIdRef.current !== requestId) return false;

    void track('changed-notification-sound-theme', {
      theme: value === DEFAULT_SOUND_PACK ? value : 'custom',
    }).catch((error) => {
      console.error('Failed to track sound pack change', error);
    });
    return true;
  };

  return {
    soundLoudness,
    currentPack,
    packOptions,
    soundPackItems,
    loudnessIndex,
    previewSound,
    handleLoudnessChange,
    handleSoundPackChange,
  };
}
