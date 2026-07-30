type DurationUnit = 'days' | 'hours' | 'minutes' | 'seconds';
type DurationStyle = 'compact' | 'long';
type DurationValues = Partial<Record<DurationUnit, number>>;

type DurationFormatter = {
  format(duration: DurationValues): string;
};

type IntlWithDurationFormat = typeof Intl & {
  DurationFormat: new (
    locale: string,
    options: { style: 'long' | 'narrow' },
  ) => DurationFormatter;
};

const DurationFormat = (Intl as IntlWithDurationFormat).DurationFormat;
const durationFormatters: Record<DurationStyle, DurationFormatter> = {
  compact: new DurationFormat('en', { style: 'narrow' }),
  long: new DurationFormat('en', { style: 'long' }),
};

const durationUnits: Array<{
  milliseconds: number;
  unit: DurationUnit;
}> = [
  { unit: 'days', milliseconds: 86_400_000 },
  { unit: 'hours', milliseconds: 3_600_000 },
  { unit: 'minutes', milliseconds: 60_000 },
  { unit: 'seconds', milliseconds: 1_000 },
];

export function formatDuration(
  milliseconds: number,
  {
    maxUnits = 2,
    style = 'compact',
  }: { maxUnits?: number; style?: DurationStyle } = {},
): string {
  let remaining = Math.max(0, Math.floor(milliseconds / 1_000) * 1_000);
  const duration: DurationValues = {};
  let unitCount = 0;

  for (const { unit, milliseconds: unitMilliseconds } of durationUnits) {
    const value = Math.floor(remaining / unitMilliseconds);
    if (value === 0) continue;
    duration[unit] = value;
    unitCount += 1;
    remaining -= value * unitMilliseconds;
    if (unitCount >= Math.max(1, maxUnits)) break;
  }

  if (unitCount === 0) duration.seconds = 0;
  return durationFormatters[style].format(duration);
}
