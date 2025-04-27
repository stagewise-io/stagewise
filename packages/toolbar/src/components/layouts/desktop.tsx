// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import { ToolbarArea } from "@/components/toolbar/desktop-only/area";
import { useAppState } from "@/hooks/use-app-state";
import { cn } from "@/utils";
import { ExpandButton } from "../expand-button";
import { useRef } from "preact/hooks";

export function DesktopLayout() {
  console.log("DesktopLayout rendered!");
  const minimized = useAppState((state) => state.minimized);

  const portalTarget = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("fixed inset-0 h-screen w-screen")}>
      {!minimized && <ToolbarArea />}
      {minimized && <ExpandButton />}
    </div>
  );
}
