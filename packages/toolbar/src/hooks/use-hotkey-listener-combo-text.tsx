import { hotkeyActionDefinitions, HotkeyActions } from "../utils";
import useBrowserInfo from "./use-user-agent";

export function useHotkeyListenerComboText(action: HotkeyActions) {
    const userAgent = useBrowserInfo();

    return userAgent.os.name === "Mac OS"
        ? hotkeyActionDefinitions[action].keyComboMac
        : hotkeyActionDefinitions[action].keyComboDefault;
}
