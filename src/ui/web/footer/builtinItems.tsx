import type { ReactNode } from "react";
import { CONFIG_ORDER_BASE, registerFooterItem, type FooterItem } from "@modules/core/footerRegistry";
import { defaultFooterComponents } from "@web/defaultUiSettings";
import {
  FajkaChip,
  LampChip,
  CombatChip,
  ZaskChip,
  AttackChip,
  TeamChip,
  TransportChip,
  PackageChip,
  MailChip,
  ApocalypseChip,
  BreakItemChip,
  ClockChip,
  WeaponChip,
  CoverChip,
  OrderChip,
  ConnectionChip,
} from "./chips";

/**
 * The complete set of built-in footer chips, as registry items. Their ids match
 * the `uiSettings.footerComponents` config ids, so the registry can apply the
 * user's show/hide + ordering to them.
 *
 * A host opts into these by calling `registerBuiltinFooterItems()` once (the
 * forge HUD does). The registry then filters/orders them by config and merges
 * them with any plugin items — so the host just renders `getFooterItems()`.
 */
const CHIPS: Record<string, () => ReactNode> = {
  "clock-display": () => <ClockChip />,
  "pipe-status": () => <FajkaChip />,
  "lamp-timer": () => <LampChip />,
  "weapon-state": () => <WeaponChip />,
  "combat-timer": () => <CombatChip />,
  "zask-timer": () => <ZaskChip />,
  "release-guard-timer": () => <CoverChip />,
  "attack-mode": () => <AttackChip />,
  "order-timer": () => <OrderChip />,
  "team-panel": () => <TeamChip />,
  "transport-timer": () => <TransportChip />,
  "package-status": () => <PackageChip />,
  "mail-status": () => <MailChip />,
  "world-destruction-timer": () => <ApocalypseChip />,
  "break-item-warning": () => <BreakItemChip />,
  "connection-status": () => <ConnectionChip />,
};

// Until a player saves their own footer config, the chips sit (and hide) exactly as
// the default config says, so saving the settings once changes nothing on screen.
export const BUILTIN_FOOTER_ITEMS: FooterItem[] = defaultFooterComponents
  .filter((config) => config.id in CHIPS)
  .map((config) => ({
    id: config.id,
    order: CONFIG_ORDER_BASE + config.order,
    hiddenByDefault: !config.visible,
    source: "builtin" as const,
    render: CHIPS[config.id],
  }));

/** Register the built-in chips into the common registry (call once per UI that wants them). */
export function registerBuiltinFooterItems(): void {
  for (const item of BUILTIN_FOOTER_ITEMS) registerFooterItem(item);
}
