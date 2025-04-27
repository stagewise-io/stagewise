import "./app.css";

import { ContextProviders } from "./components/context-providers";
import { HotkeyListener } from "./components/hotkey-listener";
import { DesktopLayout } from "./components/layouts/desktop";
import { RemoveScroll } from "react-remove-scroll";
import { ClickBlocker } from "./components/click-blocker";
import { FocusLock } from "./components/focus-lock";
import { VisibilityManager } from "./components/visibility-manager";
import { useAppState } from "./hooks/use-app-state";

export function App() {
  const isMainAppBlocked = useAppState((state) => state.isMainAppBlocked);

  return (
    <>
      <FocusLock />
      <ClickBlocker
        className="fixed inset-0 h-screen w-screen"
        enable={isMainAppBlocked}
      />

      <HotkeyListener />
      <ContextProviders>
        <VisibilityManager>
          {/* Depending on the screen size, load either the mobile or the desktop companion layout */}
          {/* Until the mobile layout is ready, we will always load the desktop layout */}
          <DesktopLayout />
        </VisibilityManager>
      </ContextProviders>
    </>
  );
}
