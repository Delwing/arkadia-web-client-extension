import { useEffect, useMemo, useState } from "react";
import { globalStorage } from "@modules/core/storage";
import type { FooterLayout, FooterLayoutTweakSet, FooterPresetId } from "@shared/footerLayoutTypes";
import { FOOTER_PRESETS } from "./presets";
import { tweakLayout } from "./layoutTree";

interface Pick {
  choice?: FooterPresetId;
  tweaks?: FooterLayoutTweakSet;
}

function readPick(): Pick {
  const settings = globalStorage.get("uiSettings") as { footerLayout?: unknown; footerLayoutTweaks?: unknown } | null;
  const choice = settings?.footerLayout;
  const tweaks = settings?.footerLayoutTweaks;
  return {
    choice: typeof choice === "string" && choice in FOOTER_PRESETS ? (choice as FooterPresetId) : undefined,
    tweaks: tweaks && typeof tweaks === "object" ? (tweaks as FooterLayoutTweakSet) : undefined,
  };
}

/**
 * The footer layout the player picked (`uiSettings.footerLayout`) with their
 * tweaks to it (`footerLayoutTweaks`), or the UI's own when they have not
 * picked one; follows the settings live.
 */
export function useFooterLayout(native: FooterLayout): FooterLayout {
  const [pick, setPick] = useState(readPick);
  // The settings are written often; only a different pick or tweak redraws the footer.
  useEffect(() => globalStorage.onChange("uiSettings", () => {
    const next = readPick();
    setPick((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }), []);
  return useMemo(
    () => (pick.choice ? tweakLayout(FOOTER_PRESETS[pick.choice], pick.tweaks?.[pick.choice]) : native),
    [pick, native],
  );
}
