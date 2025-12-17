import { Menu as MenuBase } from '@base-ui/react/menu';
import type { ComponentProps, ReactElement } from 'react';
import { cn } from '../lib/utils';
import { ChevronRightIcon } from 'lucide-react';

export const Menu = MenuBase.Root;

export type MenuTriggerProps = Omit<
  ComponentProps<typeof MenuBase.Trigger>,
  'render' | 'className'
> & {
  children: React.ReactElement;
};
export function MenuTrigger({ children, ...props }: MenuTriggerProps) {
  return (
    <MenuBase.Trigger
      {...props}
      /* We do this because it works just fine but for some reason the types bitch around... */
      render={children as unknown as () => ReactElement}
    />
  );
}

export type MenuContentProps = Omit<
  ComponentProps<typeof MenuBase.Positioner> &
    ComponentProps<typeof MenuBase.Popup>,
  'render'
> & {
  children: React.ReactNode;
};
export function MenuContent({
  align = 'center',
  alignOffset,
  side,
  sideOffset = 8,
  sticky,
  className,
  children,
  ...props
}: MenuContentProps) {
  return (
    <MenuBase.Portal>
      <MenuBase.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        sticky={sticky}
        className="z-50"
      >
        <MenuBase.Popup
          {...props}
          className={cn(
            'flex origin-[var(--transform-origin)] flex-col items-stretch gap-0.5 rounded-lg bg-background/90 p-1 ring-1 ring-muted-foreground/30 backdrop-blur-sm transition-[transform,scale,opacity] duration-150 ease-out data-[ending-style]:scale-90 data-[starting-style]:scale-90 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0',
            className,
          )}
        >
          {children}
        </MenuBase.Popup>
      </MenuBase.Positioner>
    </MenuBase.Portal>
  );
}

export type MenuItemProps = ComponentProps<typeof MenuBase.Item>;
export function MenuItem({ children, className, ...props }: MenuItemProps) {
  return (
    <MenuBase.Item
      {...props}
      className={cn(
        'flex w-full min-w-24 cursor-default flex-row items-center justify-start gap-2 rounded-md px-2 py-1.5 text-foreground text-sm transition-all duration-150 ease-out hover:bg-foreground/5 hover:pr-1.75 hover:pl-2.25',
        className,
      )}
    >
      {children}
    </MenuBase.Item>
  );
}

export const MenuSeparator = ({
  className,
  ...props
}: ComponentProps<typeof MenuBase.Separator>) => (
  <MenuBase.Separator
    {...props}
    className={(state) =>
      cn(
        'my-0.5 bg-muted-foreground/10',
        className,
        state.orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      )
    }
  />
);

export const MenuGroup = MenuBase.Group;
export const MenuGroupLabel = MenuBase.GroupLabel;
export const MenuRadioGroup = MenuBase.RadioGroup;
export const MenuRadioItem = MenuBase.RadioItem;
export const MenuCheckboxItem = MenuBase.CheckboxItem;
export const MenuSubmenu = MenuBase.SubmenuRoot;

export type MenuSubmenuTriggerProps = ComponentProps<
  typeof MenuBase.SubmenuTrigger
>;
export function MenuSubmenuTrigger({
  children,
  className,
  ...props
}: MenuSubmenuTriggerProps) {
  return (
    <MenuBase.SubmenuTrigger
      {...props}
      className={cn(
        'group flex w-full min-w-24 cursor-default flex-row items-center justify-start gap-2 rounded-md px-2 py-1.5 text-foreground text-sm transition-all duration-150 ease-out hover:bg-black/5 hover:pr-1.75 hover:pl-2.25 dark:hover:bg-white/5',
        className,
      )}
    >
      {children}
      <ChevronRightIcon className="ml-2 size-3 opacity-50 group-hover:opacity-100" />
    </MenuBase.SubmenuTrigger>
  );
}

export type MenuSubmenuContentProps = MenuContentProps;
export function MenuSubmenuContent({
  align = 'center',
  alignOffset,
  side,
  sideOffset = 0,
  sticky,
  className,
  children,
  ...props
}: MenuSubmenuContentProps) {
  return (
    <MenuContent
      {...props}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      sticky={sticky}
      className={className}
    >
      {children}
    </MenuContent>
  );
}
