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
  type ButtonProps,
} from '@headlessui/react';
import { forwardRef, Fragment, type Ref } from 'react';

export const DropdownMenu = Menu;

export const DropdownMenuButton = forwardRef(
  (
    props: MenuButtonProps & { className?: string },
    ref: Ref<HTMLButtonElement>,
  ) => {
    return <MenuButton as={Fragment} ref={ref} {...props} />;
  },
);

export const DropdownMenuContent = forwardRef(
  (props: MenuItemsProps, ref: Ref<HTMLElement>) => {
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
  (
    props: MenuItemProps & ButtonProps & { className?: string },
    ref: Ref<HTMLButtonElement | HTMLElement>,
  ) => {
    const { className, ...buttonProps } = props;
    return (
      <MenuItem ref={ref}>
        <Button
          as="button"
          {...buttonProps}
          className={cn(DropdownMenuItemStyles, className)}
        />
      </MenuItem>
    );
  },
);

export const DropdownMenuLinkItem = forwardRef(
  (
    props: React.AnchorHTMLAttributes<HTMLAnchorElement>,
    ref: Ref<HTMLElement>,
  ) => {
    return (
      <MenuItem ref={ref}>
        <a {...props} className={cn(DropdownMenuItemStyles, props.className)} />
      </MenuItem>
    );
  },
);
