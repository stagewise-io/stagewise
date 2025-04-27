import { type VNode } from "preact";

export function ToolbarSection({ children }: { children?: VNode }) {
  return (
    <div className="flex max-h-full max-w-sm snap-start flex-row items-center justify-between gap-2 border-x border-l-transparent border-r-border/30 px-3 animate-in fade-in slide-in-from-bottom-2 first:pl-0 last:border-r-transparent last:pr-0">
      {children}
    </div>
  );
}
