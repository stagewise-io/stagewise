import { Button, type ButtonProps } from "@headlessui/react";
import { forwardRef } from "preact/compat";
import { type VNode } from "preact";
import { ToolbarItem } from "./item";
import { cn } from "@/utils";

export interface ToolbarButtonProps extends ButtonProps {
  badgeContent?: VNode;
  badgeClassName?: string;
  statusDot?: boolean;
  statusDotClassName?: string;
  tooltipHint?: string;
  variant?: "default" | "promoted";
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  (
    {
      badgeContent,
      badgeClassName,
      statusDot,
      statusDotClassName,
      tooltipHint,
      variant = "default",
      ...props
    },
    ref
  ) => {
    const button = (
      <Button
        ref={ref}
        {...props}
        className={cn(
          "flex items-center justify-center p-1 hover:bg-zinc-950/5 rounded-full",
          variant === "default" ? "size-8" : "h-8 rounded-full"
        )}
      />
    );
    return (
      <ToolbarItem
        badgeContent={badgeContent}
        badgeClassName={badgeClassName}
        statusDot={statusDot}
        statusDotClassName={statusDotClassName}
      >
        {button}
      </ToolbarItem>
    );
  }
);
ToolbarButton.displayName = "ToolbarButton";
