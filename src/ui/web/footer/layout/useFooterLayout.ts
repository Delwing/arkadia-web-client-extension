import { useEffect, useMemo, useState } from "react";
import { globalStorage } from "@modules/core/storage";
import { sanitizeFooterLayout } from "@shared/footerLayoutSanitize";
import type { FooterLayout, FooterLayoutChoice, FooterLayoutTweakSet } from "@shared/footerLayoutTypes";
import { FOOTER_PRESETS, STOCK_FOOTER_LAYOUT } from "./presets";
import { tweakLayout } from "./layoutTree";

interface Pick {
  choice?: FooterLayoutChoice;
  tweaks?: FooterLayoutTweakSet;
  custom?: unknown;
}

function readPick(): Pick {
  const settings = globalStorage.get("uiSettings") as {
    footerLayout?: unknown;
    footerLayoutTweaks?: unknown;
    footerCustomLayout?: unknown;
  } | null;
  const choice = settings?.footerLayout;
  const tweaks = settings?.footerLayoutTweaks;
  return {
    choice: typeof choice === "string" && (choice in FOOTER_PRESETS || choice === "custom") ? (choice as FooterLayoutChoice) : undefined,
    tweaks: tweaks && typeof tweaks === "object" ? (tweaks as FooterLayoutTweakSet) : undefined,
    custom: settings?.footerCustomLayout,
  };
}

function resolve(pick: Pick): FooterLayout {
  if (pick.choice === "custom") return sanitizeFooterLayout(pick.custom) ?? STOCK_FOOTER_LAYOUT;
  // Nothing picked is the classic layout.
  const preset = pick.choice ?? "stock";
  return tweakLayout(FOOTER_PRESETS[preset], pick.tweaks?.[preset]);
}

/**
 * The footer layout the player picked (`uiSettings.footerLayout`): a preset
 * with their tweaks to it (`footerLayoutTweaks`) - the classic one when
 * nothing is picked - or their own layout (`footerCustomLayout`). Every UI
 * draws the same. Follows the settings live.
 */
export function useFooterLayout(): FooterLayout {
  const [pick, setPick] = useState(readPick);
  // The settings are written often; only a different pick, tweak or layout redraws the footer.
  useEffect(() => globalStorage.onChange("uiSettings", () => {
    const next = readPick();
    setPick((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }), []);
  return useMemo(() => resolve(pick), [pick]);
}
