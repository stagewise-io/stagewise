import { cn } from "@/utils";
import {
  Menu,
  MenuButton,
  MenuButtonProps,
  MenuItems,
  MenuItemsProps,
  MenuItem,
  MenuItemProps,
  Button,
} from "@headlessui/react";
import { forwardRef, Fragment, Ref } from "preact/compat";

export const DropdownMenu = Menu;

export const DropdownMenuButton = forwardRef(
  (props: MenuButtonProps, ref: Ref<typeof MenuButton>) => {
    return <MenuButton as={Fragment} ref={ref} {...props} />;
  }
);

export const DropdownMenuContent = forwardRef(
  (props: MenuItemsProps, ref: Ref<typeof MenuItems>) => {
    return (
      <MenuItems
        as={Fragment}
        ref={ref}
        anchor="bottom"
        transition
        portal
        {...props}
        className={cn(
          "min-w-24 max-w-90 w-fit z-50 rounded-lg p-2 border border-border/30 bg-background/60 backdrop-blur-md flex flex-col gap-1 items-stretch justify-start",
          props.className
        )}
      />
    );
  }
);

const DropdownMenuItemStyles =
  "w-full flex flex-row select-none items-center justify-start gap-2 p-2 pr-6 truncate overflow-hidden rounded-md hover:bg-zinc-950/10 data-focus:text-zinc-900 data-hover:text-zinc-900 data-focus:text-zinc-900 cursor-pointer transition-color duration-150 text-sm font-normal text-foreground";

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
  }
);

export const DropdownMenuLinkItem = forwardRef(
  (props: MenuItemProps, ref: Ref<typeof MenuItem>) => {
    return (
      <MenuItem ref={ref}>
        <a {...props} className={cn(DropdownMenuItemStyles, props.className)} />
      </MenuItem>
    );
  }
);
