import { useEffect, useState } from "react";
import { globalStorage } from "@modules/core/storage";
import type { FooterLayout, FooterPresetId } from "@shared/footerLayoutTypes";
import { FOOTER_PRESETS } from "./presets";

function readChoice(): FooterPresetId | undefined {
  const choice = (globalStorage.get("uiSettings") as { footerLayout?: unknown } | null)?.footerLayout;
  return typeof choice === "string" && choice in FOOTER_PRESETS ? (choice as FooterPresetId) : undefined;
}

/**
 * The footer layout the player picked (`uiSettings.footerLayout`), or the UI's
 * own when they have not picked one; follows the setting live.
 */
export function useFooterLayout(native: FooterLayout): FooterLayout {
  const [choice, setChoice] = useState(readChoice);
  useEffect(() => globalStorage.onChange("uiSettings", () => setChoice(readChoice())), []);
  return choice ? FOOTER_PRESETS[choice] : native;
}
