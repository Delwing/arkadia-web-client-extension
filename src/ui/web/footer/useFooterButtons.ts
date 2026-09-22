import { useSyncExternalStore } from "react";
import {
  getFooterButtons,
  subscribeFooterButtons,
  type FooterButton,
} from "@modules/core/footerButtonRegistry";

/**
 * React hook: the live, ordered footer buttons - the player's own and any a
 * plugin added, each already carrying whether its state flag is on.
 */
export function useFooterButtons(): FooterButton[] {
  return useSyncExternalStore(subscribeFooterButtons, getFooterButtons, getFooterButtons);
}
