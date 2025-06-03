import { cn } from '@/utils';
import {
  Menu,
  MenuButton,
  type MenuButtonProps,
  MenuItems,
  type MenuItemsProps,
  MenuItem,
  type MenuItemProps,
  Button,
} from '@headlessui/react';
import { forwardRef, Fragment, type Ref } from 'preact/compat';

export const DropdownMenu = Menu;

export const DropdownMenuButton = forwardRef(
  (props: MenuButtonProps, ref: Ref<typeof MenuButton>) => {
    return <MenuButton as={Fragment} ref={ref} {...props} />;
  },
);

export const DropdownMenuContent = forwardRef(
  (props: MenuItemsProps, ref: Ref<typeof MenuItems>) => {
    return (
      <MenuItems
        ref={ref}
        anchor="bottom"
        transition
        portal
        {...props}
        className={cn(
          'z-50 flex w-fit min-w-24 max-w-90 flex-col items-stretch justify-start gap-1 rounded-lg border border-border/30 border-solid bg-background/60 p-1 shadow-black/50 shadow-lg outline-none backdrop-blur-md data-focus:outline-none',
          props.className,
        )}
      />
    );
  },
);

const DropdownMenuItemStyles =
  'w-full flex flex-row select-none items-center justify-start gap-2 p-2 pr-6 truncate overflow-hidden rounded-md hover:bg-zinc-950/10 focus:text-zinc-900 cursor-pointer transition-color duration-150 text-sm font-normal text-foreground';

export const DropdownMenuButttonItem = forwardRef(
  (props: MenuItemProps, ref: Ref<typeof MenuItem>) => {
    return (
      <MenuItem ref={ref}>
        <Button
          {...props}
          className={cn(DropdownMenuItemStyles, props.className)}
        />
      </MenuItem>
    );
  },
);

export const DropdownMenuLinkItem = forwardRef(
  (props: MenuItemProps, ref: Ref<typeof MenuItem>) => {
    return (
      <MenuItem ref={ref}>
        <a {...props} className={cn(DropdownMenuItemStyles, props.className)} />
      </MenuItem>
    );
  },
);
