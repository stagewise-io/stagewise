import { cn } from "@/utils";

// This component creates a transparent element that blocks all clicks on the elements below it.
export function ClickBlocker(props: {
  enable?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        typeof props.enable === "undefined" || props.enable
          ? "pointer-events-auto"
          : "pointer-events-none",
        props.className
      )}
      onClick={props.onClick}
    />
  );
}
