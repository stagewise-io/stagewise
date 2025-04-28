// This component manages the main layout of the companion UI. It is responsible for rendering the toolbar, the main content area, and the sidebar.

import { ToolbarArea } from "@/components/toolbar/desktop-only/area";
import { useAppState } from "@/hooks/use-app-state";
import { cn } from "@/utils";
import { ExpandButton } from "../expand-button";
import { useChatState } from "@/hooks/use-chat-state";
import { SelectorCanvas } from "../dom-context/selector-canvas";
import { useMemo } from "preact/hooks";

export function DesktopLayout() {
  console.log("DesktopLayout rendered!");
  const minimized = useAppState((state) => state.minimized);

  return (
    <div className={cn("fixed inset-0 h-screen w-screen")}>
      <SelectorCanvas />
      {!minimized && <ToolbarArea />}
      {minimized && <ExpandButton />}
    </div>
  );
}
