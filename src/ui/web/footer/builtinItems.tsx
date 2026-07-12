import { registerFooterItem, type FooterItem } from "@modules/core/footerRegistry";
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
} from "./chips";

/**
 * The complete set of built-in footer chips, as registry items. Their ids match
 * the `uiSettings.footerComponents` config ids, so the registry can apply the
 * user's show/hide + ordering to them; the `order` here is only the fallback when
 * an item isn't in that config.
 *
 * A host opts into these by calling `registerBuiltinFooterItems()` once (the
 * forge HUD does). The registry then filters/orders them by config and merges
 * them with any plugin items — so the host just renders `getFooterItems()`.
 */
export const BUILTIN_FOOTER_ITEMS: FooterItem[] = [
  { id: "clock-display", order: 90, source: "builtin", render: () => <ClockChip /> },
  { id: "pipe-status", order: 100, source: "builtin", render: () => <FajkaChip /> },
  { id: "lamp-timer", order: 110, source: "builtin", render: () => <LampChip /> },
  { id: "weapon-state", order: 115, source: "builtin", render: () => <WeaponChip /> },
  { id: "combat-timer", order: 120, source: "builtin", render: () => <CombatChip /> },
  { id: "zask-timer", order: 130, source: "builtin", render: () => <ZaskChip /> },
  { id: "release-guard-timer", order: 135, source: "builtin", render: () => <CoverChip /> },
  { id: "attack-mode", order: 140, source: "builtin", render: () => <AttackChip /> },
  { id: "order-timer", order: 145, source: "builtin", render: () => <OrderChip /> },
  { id: "team-panel", order: 150, source: "builtin", render: () => <TeamChip /> },
  { id: "transport-timer", order: 160, source: "builtin", render: () => <TransportChip /> },
  { id: "package-status", order: 170, source: "builtin", render: () => <PackageChip /> },
  { id: "mail-status", order: 180, source: "builtin", render: () => <MailChip /> },
  { id: "world-destruction-timer", order: 190, source: "builtin", render: () => <ApocalypseChip /> },
  { id: "break-item-warning", order: 200, source: "builtin", render: () => <BreakItemChip /> },
];

/** Register the built-in chips into the common registry (call once per UI that wants them). */
export function registerBuiltinFooterItems(): void {
  for (const item of BUILTIN_FOOTER_ITEMS) registerFooterItem(item);
}
