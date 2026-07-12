import { useSyncExternalStore } from "react";
import { getFooterItems, subscribeFooterItems, type FooterItem } from "@modules/core/footerRegistry";

/** React hook: the live, sorted footer items from the common registry. */
export function useFooterItems(): FooterItem[] {
  return useSyncExternalStore(subscribeFooterItems, getFooterItems, getFooterItems);
}
