import type { DeviceEmulation } from '@shared/karton-contracts/ui';

export type DevicePreset = Omit<DeviceEmulation, 'scale' | 'fitScale'> & {
  label: string;
};

const preset = (
  presetId: string,
  label: string,
  width: number,
  height: number,
  deviceScaleFactor = 1,
  mobile = true,
): DevicePreset => ({
  presetId,
  label,
  width,
  height,
  deviceScaleFactor,
  mobile,
});

export const DEVICE_PRESETS = [
  preset('responsive', 'Responsive', 1280, 720, 1, false),
  preset('iphone-17', 'iPhone 17', 402, 874, 3),
  preset('iphone-air', 'iPhone Air', 420, 912, 3),
  preset('iphone-17-pro-max', 'iPhone 17 Pro Max', 440, 956, 3),
  preset('iphone-16e', 'iPhone 16e', 390, 844, 3),
  preset('pixel-10', 'Pixel 10', 412, 924, 2.625),
  preset('galaxy-s26-ultra', 'Galaxy S26 Ultra', 412, 892, 3.5),
  preset('ipad-pro-11', 'iPad Pro 11"', 834, 1210, 2),
  preset('ipad-mini', 'iPad mini', 744, 1133, 2),
  preset('laptop', 'Laptop', 1440, 900, 1, false),
];

export const getPresetConfig = ({ label: _label, ...config }: DevicePreset) =>
  config;

export const DEFAULT_DEVICE_EMULATION: DeviceEmulation = {
  ...getPresetConfig(DEVICE_PRESETS[0]!),
  scale: 1,
  fitScale: 1,
};
