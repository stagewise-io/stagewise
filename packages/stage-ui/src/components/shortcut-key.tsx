import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const MAC_KEY_SYMBOLS = new Set(['⌃', '⌥', '⇧', '⌘']);
const SPECIAL_KEY_SYMBOLS = new Set(['↵', '⇥', '⌫', '⌦', '⎋']);
const ARROW_KEY_SYMBOLS = new Set(['↑', '↓', '←', '→']);

const shortcutKeyVariants = cva(
  'inline-flex items-center justify-center rounded border font-medium font-mono leading-none',
  {
    variants: {
      variant: {
        chrome: 'border-foreground/10 bg-foreground/5 text-muted-foreground',
        default: 'border-border-subtle bg-surface-1 text-muted-foreground',
        subtle:
          'border-border-subtle/70 bg-background/70 text-subtle-foreground',
        tooltip: 'border-border-subtle bg-surface-2 text-muted-foreground',
      },
      size: {
        xs: 'h-4 min-w-4 px-1 text-[10px]',
        sm: 'h-5 min-w-5 px-1.5 text-[11px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  },
);

export type ShortcutKeyVariant = NonNullable<
  VariantProps<typeof shortcutKeyVariants>['variant']
>;
export type ShortcutKeySize = NonNullable<
  VariantProps<typeof shortcutKeyVariants>['size']
>;

export type ShortcutKeyProps = React.ComponentProps<'kbd'> &
  VariantProps<typeof shortcutKeyVariants>;

export function ShortcutKey({
  className,
  variant,
  size,
  ...props
}: ShortcutKeyProps) {
  return (
    <kbd
      {...props}
      className={cn(shortcutKeyVariants({ variant, size }), className)}
    />
  );
}

export type ShortcutComboProps = Omit<
  React.ComponentProps<'span'>,
  'children'
> & {
  value: string;
  variant?: ShortcutKeyVariant;
  size?: ShortcutKeySize;
};

export function ShortcutCombo({
  className,
  value,
  variant,
  size,
  ...props
}: ShortcutComboProps) {
  const keys = splitShortcut(value);

  return (
    <span
      {...props}
      className={cn('inline-flex items-center gap-0.5', className)}
      translate="no"
    >
      {keys.map((key, index) => (
        <ShortcutKey key={`${key}-${index}`} size={size} variant={variant}>
          {key}
        </ShortcutKey>
      ))}
    </span>
  );
}

function splitShortcut(value: string): string[] {
  if (value.includes('+')) {
    return value
      .split('+')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  const keys: string[] = [];
  let currentText = '';

  for (const char of value.trim()) {
    if (
      MAC_KEY_SYMBOLS.has(char) ||
      SPECIAL_KEY_SYMBOLS.has(char) ||
      ARROW_KEY_SYMBOLS.has(char)
    ) {
      if (currentText) {
        keys.push(currentText);
        currentText = '';
      }
      keys.push(char);
    } else if (char.trim()) {
      currentText += char;
    }
  }

  if (currentText) {
    keys.push(currentText);
  }

  return keys.length > 0 ? keys : [value];
}
