import { isMobileLikeViewport } from "@shared/dom/pointerEnvironment.ts";
import type { SettingsCategoryKey } from "./categories";

/**
 * The page the menu's "Przyciski" item opens: the mobile editor on a phone.
 * Kept out of categories.ts, which the assistant-KB build script imports in Node.
 */
export function buttonsSettingsCategory(): SettingsCategoryKey {
    return isMobileLikeViewport() ? "ui-mobile-buttons" : "ui-buttons";
}
