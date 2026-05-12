import { Combobox as ComboboxBase } from '@base-ui/react/combobox';
import { CheckIcon, XIcon } from 'lucide-react';
import { IconChevronDownFill18 } from 'nucleo-ui-fill-18';
import {
  type ComponentProps,
  type ComponentRef,
  forwardRef,
  memo,
  useCallback,
} from 'react';
import { cn } from '../lib/utils';
import { handleCtrlNavKeys } from '../lib/keyboard-nav';

// ============================================================================
// Types
// ============================================================================

export type ComboboxSize = 'xs' | 'sm' | 'md';
export type ComboboxTriggerVariant = 'ghost' | 'secondary';

// ============================================================================
// Size & variant configs (matches Select / SearchableSelect)
// ============================================================================

const sizes = {
  trigger: {
    xs: 'h-4 gap-1 text-xs font-normal',
    sm: 'h-5 gap-1 text-sm font-normal',
    md: 'h-6 gap-1.5 text-sm font-normal',
  } satisfies Record<ComboboxSize, string>,
  content: {
    xs: 'text-xs',
    sm: 'text-sm',
    md: 'text-sm',
  } satisfies Record<ComboboxSize, string>,
  item: {
    xs: 'px-2 py-1',
    sm: 'px-2 py-1.5',
    md: 'px-2.5 py-2',
  } satisfies Record<ComboboxSize, string>,
  icon: {
    xs: 'size-3',
    sm: 'size-3.5',
    md: 'size-3.5',
  } satisfies Record<ComboboxSize, string>,
  input: {
    xs: 'px-2 py-1 text-xs',
    sm: 'px-2 py-1.5 text-sm',
    md: 'px-2.5 py-2 text-sm',
  } satisfies Record<ComboboxSize, string>,
};

const triggerVariants = {
  ghost:
    'bg-transparent text-muted-foreground hover:text-foreground data-popup-open:text-foreground',
  secondary:
    'border border-derived bg-surface-1 text-foreground hover:bg-hover-derived active:bg-active-derived data-popup-open:bg-hover-derived',
} satisfies Record<ComboboxTriggerVariant, string>;

// ============================================================================
// Components
// ============================================================================

// --- Combobox (root) ---

export const Combobox = ComboboxBase.Root;

// --- ComboboxInput ---

export type ComboboxInputProps = Omit<
  ComponentProps<typeof ComboboxBase.Input>,
  'size'
> & {
  size?: ComboboxSize;
};

export const ComboboxInput = forwardRef<
  ComponentRef<typeof ComboboxBase.Input>,
  ComboboxInputProps
>(({ className, size = 'sm', onKeyDown, ...props }, ref) => {
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      handleCtrlNavKeys(event);
      onKeyDown?.(event as typeof event & { preventBaseUIHandler: () => void });
    },
    [onKeyDown],
  );

  return (
    <ComboboxBase.Input
      ref={ref}
      className={cn(
        'w-full rounded-md bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none',
        sizes.input[size],
        className,
      )}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
});
ComboboxInput.displayName = 'ComboboxInput';

// --- ComboboxTrigger ---

export type ComboboxTriggerProps = ComponentProps<
  typeof ComboboxBase.Trigger
> & {
  size?: ComboboxSize;
  variant?: ComboboxTriggerVariant;
};

export const ComboboxTrigger = forwardRef<
  ComponentRef<typeof ComboboxBase.Trigger>,
  ComboboxTriggerProps
>(({ className, size = 'sm', variant = 'ghost', ...props }, ref) => (
  <ComboboxBase.Trigger
    ref={ref}
    className={cn(
      'inline-flex max-w-full cursor-pointer items-center justify-between rounded-lg p-0 shadow-none transition-colors',
      'focus-visible:outline-1 focus-visible:outline-muted-foreground/35 focus-visible:-outline-offset-2',
      'has-disabled:pointer-events-none has-disabled:opacity-50',
      triggerVariants[variant],
      sizes.trigger[size],
      className,
    )}
    {...props}
  />
));
ComboboxTrigger.displayName = 'ComboboxTrigger';

// --- ComboboxValue ---

export const ComboboxValue = ComboboxBase.Value;

// --- ComboboxIcon ---

export type ComboboxIconProps = ComponentProps<typeof ComboboxBase.Icon> & {
  size?: ComboboxSize;
};

export const ComboboxIcon = forwardRef<
  ComponentRef<typeof ComboboxBase.Icon>,
  ComboboxIconProps
>(({ className, size = 'sm', children, ...props }, ref) => (
  <ComboboxBase.Icon ref={ref} className={cn('shrink-0', className)} {...props}>
    {children ?? <IconChevronDownFill18 className={sizes.icon[size]} />}
  </ComboboxBase.Icon>
));
ComboboxIcon.displayName = 'ComboboxIcon';

// --- ComboboxContent (Portal + Positioner + Popup combined) ---

export type ComboboxContentProps = ComponentProps<typeof ComboboxBase.Popup> &
  Pick<
    ComponentProps<typeof ComboboxBase.Positioner>,
    'side' | 'sideOffset' | 'align' | 'alignOffset'
  > & {
    size?: ComboboxSize;
  };

export const ComboboxContent = forwardRef<
  ComponentRef<typeof ComboboxBase.Popup>,
  ComboboxContentProps
>(
  (
    {
      className,
      size = 'sm',
      side = 'bottom',
      sideOffset = 4,
      align = 'start',
      alignOffset,
      ...props
    },
    ref,
  ) => (
    <ComboboxBase.Portal>
      <ComboboxBase.Backdrop className="fixed inset-0 z-50" />
      <ComboboxBase.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="z-50"
      >
        <ComboboxBase.Popup
          ref={ref}
          className={cn(
            'flex origin-(--transform-origin) flex-col items-stretch gap-0.5',
            'rounded-lg border border-border-subtle bg-background p-1 shadow-lg',
            'transition-[transform,scale,opacity] duration-150 ease-out',
            'data-ending-style:scale-90 data-ending-style:opacity-0',
            'data-starting-style:scale-90 data-starting-style:opacity-0',
            sizes.content[size],
            className,
          )}
          {...props}
        />
      </ComboboxBase.Positioner>
    </ComboboxBase.Portal>
  ),
);
ComboboxContent.displayName = 'ComboboxContent';

// --- ComboboxList ---

export type ComboboxListProps = ComponentProps<typeof ComboboxBase.List>;

export const ComboboxList = forwardRef<
  ComponentRef<typeof ComboboxBase.List>,
  ComboboxListProps
>(({ className, ...props }, ref) => (
  <ComboboxBase.List
    ref={ref}
    className={cn('flex flex-col gap-0.5', className)}
    {...props}
  />
));
ComboboxList.displayName = 'ComboboxList';

// --- ComboboxItem ---

export type ComboboxItemProps = ComponentProps<typeof ComboboxBase.Item> & {
  size?: ComboboxSize;
};

export const ComboboxItem = memo(
  forwardRef<ComponentRef<typeof ComboboxBase.Item>, ComboboxItemProps>(
    ({ className, size = 'sm', ...props }, ref) => (
      <ComboboxBase.Item
        ref={ref}
        className={cn(
          'group/item grid w-full min-w-24 cursor-default items-center gap-2 rounded-md',
          'grid-cols-[0.75rem_1fr]',
          'text-foreground outline-none transition-colors duration-150 ease-out',
          'data-highlighted:bg-hover-derived',
          'data-disabled:pointer-events-none data-disabled:opacity-50',
          sizes.item[size],
          className,
        )}
        {...props}
      />
    ),
  ),
);
ComboboxItem.displayName = 'ComboboxItem';

// --- ComboboxItemIndicator ---

export type ComboboxItemIndicatorProps = ComponentProps<
  typeof ComboboxBase.ItemIndicator
>;

export const ComboboxItemIndicator = memo(
  forwardRef<
    ComponentRef<typeof ComboboxBase.ItemIndicator>,
    ComboboxItemIndicatorProps
  >(({ className, children, ...props }, ref) => (
    <ComboboxBase.ItemIndicator
      ref={ref}
      className={cn('col-start-1 shrink-0', className)}
      {...props}
    >
      {children ?? <CheckIcon className="size-full text-muted-foreground" />}
    </ComboboxBase.ItemIndicator>
  )),
);
ComboboxItemIndicator.displayName = 'ComboboxItemIndicator';

// --- ComboboxItemText ---

export const ComboboxItemText = forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & { className?: string }
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn('col-start-2 truncate', className)}
    {...props}
  />
));
ComboboxItemText.displayName = 'ComboboxItemText';

// --- ComboboxEmpty ---

export type ComboboxEmptyProps = ComponentProps<typeof ComboboxBase.Empty>;

export const ComboboxEmpty = forwardRef<
  ComponentRef<typeof ComboboxBase.Empty>,
  ComboboxEmptyProps
>(({ className, children, ...props }, ref) => (
  <ComboboxBase.Empty
    ref={ref}
    className={cn('px-2 py-1.5 text-muted-foreground text-xs', className)}
    {...props}
  >
    {children ?? 'No results'}
  </ComboboxBase.Empty>
));
ComboboxEmpty.displayName = 'ComboboxEmpty';

// --- ComboboxGroup ---

export type ComboboxGroupProps = ComponentProps<typeof ComboboxBase.Group>;

export const ComboboxGroup = forwardRef<
  ComponentRef<typeof ComboboxBase.Group>,
  ComboboxGroupProps
>(({ className, ...props }, ref) => (
  <ComboboxBase.Group ref={ref} className={cn(className)} {...props} />
));
ComboboxGroup.displayName = 'ComboboxGroup';

// --- ComboboxGroupLabel ---

export type ComboboxGroupLabelProps = ComponentProps<
  typeof ComboboxBase.GroupLabel
>;

export const ComboboxGroupLabel = forwardRef<
  ComponentRef<typeof ComboboxBase.GroupLabel>,
  ComboboxGroupLabelProps
>(({ className, ...props }, ref) => (
  <ComboboxBase.GroupLabel
    ref={ref}
    className={cn(
      'shrink-0 px-2 py-1 font-normal text-subtle-foreground text-xs',
      className,
    )}
    {...props}
  />
));
ComboboxGroupLabel.displayName = 'ComboboxGroupLabel';

// --- ComboboxClear ---

export type ComboboxClearProps = ComponentProps<typeof ComboboxBase.Clear>;

export const ComboboxClear = forwardRef<
  ComponentRef<typeof ComboboxBase.Clear>,
  ComboboxClearProps
>(({ className, children, ...props }, ref) => (
  <ComboboxBase.Clear
    ref={ref}
    className={cn(
      'flex shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground',
      'size-4',
      className,
    )}
    {...props}
  >
    {children ?? <XIcon className="size-3" />}
  </ComboboxBase.Clear>
));
ComboboxClear.displayName = 'ComboboxClear';

// --- ComboboxChips ---

export type ComboboxChipsProps = ComponentProps<typeof ComboboxBase.Chips>;

export const ComboboxChips = forwardRef<
  ComponentRef<typeof ComboboxBase.Chips>,
  ComboboxChipsProps
>(({ className, ...props }, ref) => (
  <ComboboxBase.Chips
    ref={ref}
    className={cn('flex flex-wrap gap-1', className)}
    {...props}
  />
));
ComboboxChips.displayName = 'ComboboxChips';

// --- ComboboxChip ---

export type ComboboxChipProps = ComponentProps<typeof ComboboxBase.Chip>;

export const ComboboxChip = forwardRef<
  ComponentRef<typeof ComboboxBase.Chip>,
  ComboboxChipProps
>(({ className, ...props }, ref) => (
  <ComboboxBase.Chip
    ref={ref}
    className={cn(
      'inline-flex items-center gap-1 rounded-md border border-derived bg-surface-1 px-1.5 py-0.5 text-foreground text-xs',
      className,
    )}
    {...props}
  />
));
ComboboxChip.displayName = 'ComboboxChip';

// --- ComboboxChipDelete ---

export type ComboboxChipDeleteProps = ComponentProps<
  typeof ComboboxBase.ChipRemove
>;

export const ComboboxChipDelete = forwardRef<
  ComponentRef<typeof ComboboxBase.ChipRemove>,
  ComboboxChipDeleteProps
>(({ className, children, ...props }, ref) => (
  <ComboboxBase.ChipRemove
    ref={ref}
    className={cn(
      'flex shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground',
      'size-3.5',
      className,
    )}
    {...props}
  >
    {children ?? <XIcon className="size-3" />}
  </ComboboxBase.ChipRemove>
));
ComboboxChipDelete.displayName = 'ComboboxChipDelete';

// --- useComboboxFilter ---

export const useComboboxFilter = ComboboxBase.useFilter;
