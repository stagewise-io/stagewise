import { cn } from "@/utils";
import { type VNode } from "preact";

export interface ToolbarItemProps {
  badgeContent?: VNode;
  badgeClassName?: string;
  statusDot?: boolean;
  statusDotClassName?: string;
  children?: VNode;
}

export function ToolbarItem(props: ToolbarItemProps) {
  return (
    <div className="flex h-full shrink-0 items-center justify-center">
      {props.children}
      {props.badgeContent && (
        <div
          className={cn(
            "bg-blue-600 text-white",
            props.badgeClassName,
            "pointer-events-none absolute -bottom-0.5 -right-1 flex h-4 w-max min-w-4 max-w-8 select-none items-center justify-center truncate rounded-full px-1 text-xs font-semibold"
          )}
        >
          {props.badgeContent}
        </div>
      )}
      {props.statusDot && (
        <div
          className={cn(
            "bg-rose-600",
            props.statusDotClassName,
            "pointer-events-none absolute right-0 top-0 size-1.5 rounded-full"
          )}
        ></div>
      )}
    </div>
  );
}
