import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const MAC_KEY_SYMBOLS = new Set(['⌃', '⌥', '⇧', '⌘']);
const SPECIAL_KEY_SYMBOLS = new Set(['↵', '⇥', '⌫', '⌦', '⎋']);
const ARROW_KEY_SYMBOLS = new Set(['↑', '↓', '←', '→']);

const KEY_LABELS: Record<string, string> = {
  arrowdown: '↓',
  arrowleft: '←',
  arrowright: '→',
  arrowup: '↑',
  backspace: '⌫',
  delete: '⌦',
  enter: '↵',
  esc: 'Esc',
  escape: 'Esc',
  return: '↵',
  shift: '⇧',
  slash: '/',
  tab: '⇥',
};

const shortcutKeyVariants = cva(
  'inline-flex items-center justify-center rounded border font-medium font-mono text-current leading-none',
  {
    variants: {
      variant: {
        chrome: 'border-transparent bg-foreground/5 text-muted-foreground',
        default: 'border-derived bg-active-derived',
        subtle: 'border-derived bg-active-derived opacity-80',
        surface: 'border-derived-strong bg-active-derived',
        solid:
          'border-transparent bg-shortcut-solid-derived group-hover/button:bg-shortcut-solid-hover-derived group-focus-visible/button:bg-shortcut-solid-hover-derived group-active/button:bg-shortcut-solid-active-derived',
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
  children,
  className,
  variant,
  size,
  ...props
}: ShortcutKeyProps) {
  return (
    <kbd
      {...props}
      className={cn(shortcutKeyVariants({ variant, size }), className)}
    >
      {children === '↵' ? (
        <ReturnKeyIcon size={size} />
      ) : children === '⇧' ? (
        <ShiftKeyIcon size={size} />
      ) : typeof children === 'string' && MAC_KEY_SYMBOLS.has(children) ? (
        <span className={cn(size === 'xs' ? 'text-[11px]' : 'text-xs')}>
          {children}
        </span>
      ) : (
        children
      )}
    </kbd>
  );
}

function ReturnKeyIcon({ size }: { size?: ShortcutKeySize | null }) {
  return (
    <svg
      aria-hidden="true"
      className={cn(size === 'xs' ? 'size-2.5' : 'size-3')}
      fill="none"
      viewBox="0 0 12 12"
    >
      <path
        d="m1.25 6.75h8.5c.5523 0 1-.4477 1-1v-2.5c0-.5523-.4477-1-1-1h-1.75"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <polyline
        points="3.75 4 1 6.75 3.75 9.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ShiftKeyIcon({ size }: { size?: ShortcutKeySize | null }) {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        size === 'xs' ? 'size-2.5' : 'size-3',
        '-translate-y-[0.25px]',
      )}
      fill="none"
      viewBox="0 0 18 18"
    >
      <path
        d="M14.391 8.448 9.398 1.867c-.2-.264-.597-.264-.797 0L3.609 8.448c-.25.329-.015.802.398.802H6.75v6c0 .552.448 1 1 1h2.5c.552 0 1-.448 1-1v-6h2.743c.413 0 .648-.473.398-.802Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
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
    const parts = value.split('+');
    const keys = parts
      .slice(0, -1)
      .map((part) => normalizeKeyLabel(part.trim()))
      .filter(Boolean);
    const lastPart = parts[parts.length - 1]?.trim();
    if (lastPart) keys.push(normalizeKeyLabel(lastPart));
    else keys.push('+');
    return keys;
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
        keys.push(normalizeKeyLabel(currentText));
        currentText = '';
      }
      keys.push(char);
    } else if (char.trim()) {
      currentText += char;
    }
  }

  if (currentText) {
    keys.push(normalizeKeyLabel(currentText));
  }

  return keys.length > 0 ? keys : [value];
}

function normalizeKeyLabel(key: string): string {
  return KEY_LABELS[key.toLowerCase()] ?? key;
}
