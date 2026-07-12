import { useState } from "react";
import eventBus from "@modules/core/eventBus";
import type { PackageStatus } from "@shared/events/clientEvents";
import { useClientEvent } from "../hooks";
import { Chip, type ChipTone } from "./Chip";
import { ChipIcon } from "./icons";

/**
 * The footer status chips.
 *
 * Each chip is a self-contained component subscribing to the same client event
 * the stock footer components use (src/ui/web/components/**), but rendering pure
 * JSX through the shared <Chip>. A chip returns null when its data is absent, so
 * a strip only ever shows what is currently relevant; Fajka is the one always-on
 * chip (it mirrors the ever-present pipe indicator).
 *
 * These are the building blocks — hosts compose them: the forge HUD renders them
 * all through <FooterStrip>, and other UIs can pick a subset.
 */

/** M:SS from a seconds count (floored). */
function mmss(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

/** Pipe: lit ember when puffed, dim when out. Click lights / snuffs it. */
export function FajkaChip() {
  const [lit, setLit] = useState(false);
  useClientEvent<boolean>("pipeLit", (v) => setLit(Boolean(v)));
  return (
    <Chip
      icon={<span className="chip__ico"><span className={`chip__ember${lit ? " chip__ember--lit" : ""}`} /></span>}
      label="Fajka"
      value={lit ? "pali sie" : "zgasla"}
      tone={lit ? "warn" : undefined}
      title={lit ? "Zgas fajke" : "Zapal fajke"}
      onClick={() => eventBus.emit("sendCommand", { command: lit ? "zgas fajke" : "/zapal" })}
    />
  );
}

/** Oil-lamp fuel remaining. Click tops it up. */
export function LampChip() {
  const [seconds, setSeconds] = useState<number | null>(null);
  useClientEvent<number | null>("lampTimer", (v) => setSeconds(v));
  if (seconds == null || seconds <= 0) return null;
  const tone: ChipTone = seconds < 30 ? "danger" : seconds < 60 ? "warn" : "ok";
  return (
    <Chip
      icon={<ChipIcon name="lamp" />}
      label="Lampa"
      value={mmss(seconds)}
      tone={tone}
      title="Napelnij lampe olejem"
      onClick={() => eventBus.emit("sendCommand", { command: "napelnij lampe olejem" })}
    />
  );
}

/** Combat window countdown. */
export function CombatChip() {
  const [seconds, setSeconds] = useState<number | null>(null);
  useClientEvent<number | null>("combatTimer", (v) => setSeconds(v));
  if (seconds == null || seconds <= 0) return null;
  const tone: ChipTone = seconds > 20 ? "danger" : seconds > 10 ? "warn" : "ok";
  return <Chip icon={<ChipIcon name="sword" />} label="Walka" value={seconds} tone={tone} />;
}

/** Surprise-attack readiness: OK when charged, else the remaining count. */
export function ZaskChip() {
  const [payload, setPayload] = useState<{ seconds: number; ok: boolean } | null>(null);
  useClientEvent<{ seconds: number; ok: boolean } | null>("zaskTimer", (v) => setPayload(v));
  if (!payload) return null;
  const tone: ChipTone = payload.ok ? "ok" : payload.seconds >= 20 ? "warn" : "danger";
  return <Chip icon={<ChipIcon name="shield" />} label="Zask" value={payload.ok ? "OK" : payload.seconds} tone={tone} />;
}

/** Attack mode (leader only): A / AW / AWR. Click cycles through them. */
export function AttackChip() {
  const [leader, setLeader] = useState(false);
  const [mode, setMode] = useState<"A" | "AW" | "AWR">("A");
  useClientEvent<boolean>("isTeamLeader", (v) => setLeader(Boolean(v)));
  useClientEvent<"A" | "AW" | "AWR">("attackMode", (v) => { if (v) setMode(v); });
  if (!leader) return null;
  const cycle = () => {
    const order = ["A", "AW", "AWR"] as const;
    const next = order[(order.indexOf(mode) + 1) % order.length];
    eventBus.emit("attackMode", next); // attackController persists + re-emits
  };
  return <Chip icon={<ChipIcon name="target" />} label="Atk" value={mode} title="Zmien tryb ataku" onClick={cycle} />;
}

/** Team presence on the current room. Click lists the roster. */
export function TeamChip() {
  const [status, setStatus] = useState<{ teamSize: number; missing: string[] }>({ teamSize: 0, missing: [] });
  useClientEvent<{ teamSize: number; missing: string[] }>("teamPanelStatus", (next) =>
    setStatus(next && typeof next.teamSize === "number" ? next : { teamSize: 0, missing: [] }));
  if (status.teamSize === 0) return null;
  const allHere = status.missing.length === 0;
  return (
    <Chip
      icon={<ChipIcon name="team" />}
      label="Druzyna"
      value={allHere ? `Wszyscy [${status.teamSize}]` : `Brak: ${status.missing.join(", ")}`}
      tone={allHere ? "ok" : "warn"}
      title="Pokaz sklad druzyny"
      onClick={() => eventBus.emit("sendCommand", { command: "druzyna" })}
    />
  );
}

/** Next transport departure. Click opens the route popup. */
export function TransportChip() {
  const [payload, setPayload] = useState<{ label: string; remaining?: number; total?: number } | null>(null);
  useClientEvent<{ label: string; remaining?: number; total?: number } | null>("transportTimer", (v) => setPayload(v));
  if (!payload) return null;
  const hasTimer = typeof payload.remaining === "number" && typeof payload.total === "number";
  const remaining = hasTimer ? Math.max(0, payload.remaining!) : null;
  const tone: ChipTone = remaining == null ? "ok" : remaining < 10 ? "danger" : remaining < 30 ? "warn" : "ok";
  const value = remaining == null ? payload.label : `${payload.label} ${mmss(remaining)}`;
  return (
    <Chip
      icon={<ChipIcon name="wheel" />}
      label="Tr"
      value={value}
      tone={tone}
      title="Otworz trase transportu"
      onClick={() => eventBus.emit("transport.popup.open")}
    />
  );
}

/** Outgoing package delivery countdown. Click leads to the drop-off room. */
export function PackageChip() {
  const [status, setStatus] = useState<PackageStatus | null>(null);
  useClientEvent<PackageStatus | null>("packageStatus", (v) => setStatus(v));
  if (!status) return null;
  const time = typeof status.seconds === "number" && status.seconds > 0 ? ` ${mmss(status.seconds)}` : "";
  const onClick = status.location != null
    ? () => eventBus.emit("leadTo", status.location!)
    : undefined;
  return (
    <Chip
      icon={<ChipIcon name="box" />}
      label="Paczka"
      value={`${status.recipient}${time}`}
      title={onClick ? "Prowadz do odbiorcy" : undefined}
      onClick={onClick}
    />
  );
}

/** Mail waiting to be collected or sent. Click dispatches the courier animal. */
export function MailChip() {
  const [state, setState] = useState<{ unreceived?: boolean; unsent?: boolean }>({});
  useClientEvent<{ unreceived?: boolean; unsent?: boolean }>("gmcp.mail.state", (s) => setState(s || {}));
  if (!state.unreceived && !state.unsent) return null;
  const parts: string[] = [];
  if (state.unreceived) parts.push("Nowa");
  if (state.unsent) parts.push("Niewyslana");
  return (
    <Chip
      icon={<ChipIcon name="mail" />}
      label="Poczta"
      value={parts.join(", ")}
      tone="warn"
      title="Wyslij zwierze pocztowe"
      onClick={() => eventBus.emit("sendCommand", { command: "wyslij zwierze" })}
    />
  );
}

/** World-destruction (apocalypse) countdown — only present while it ticks. */
export function ApocalypseChip() {
  const [seconds, setSeconds] = useState<number | null>(null);
  useClientEvent<number | null>("worldDestructionTimer", (v) => setSeconds(v));
  if (seconds == null || seconds <= 0) return null;
  return <Chip icon={<ChipIcon name="skull" />} label="Apokalipsa" value={mmss(Math.ceil(seconds))} tone="danger" />;
}

type Domain = "Empire" | "Ishtar";

/** In-game clock (HH:MM) for the active domain; date rides in the tooltip. */
export function ClockChip() {
  const [active, setActive] = useState<Domain | undefined>();
  const [clocks, setClocks] = useState<Record<string, { hours: number; minutes: number; dayLabel?: string }>>({});
  useClientEvent<{ domain: Domain }>("clock.domain.active", ({ domain }) => setActive(domain));
  useClientEvent<{ domain: Domain; hours: number; minutes: number; dayLabel?: string }>(
    "clock.update",
    (d) => setClocks((prev) => ({ ...prev, [d.domain]: { hours: d.hours, minutes: d.minutes, dayLabel: d.dayLabel } }))
  );
  const clock = active ? clocks[active] : undefined;
  if (!clock) return null;
  const value = `${String(clock.hours).padStart(2, "0")}:${String(Math.floor(clock.minutes)).padStart(2, "0")}`;
  return <Chip icon={<ChipIcon name="clock" />} label="Zegar" value={value} title={clock.dayLabel} />;
}

/** Whether a weapon is drawn. */
export function WeaponChip() {
  const [drawn, setDrawn] = useState<boolean | null>(null);
  useClientEvent<boolean>("weapon_state", (v) => setDrawn(Boolean(v)));
  if (drawn === null) return null;
  return <Chip icon={<ChipIcon name="sword" />} label="Bron" value={drawn ? "dobyta" : "schowana"} tone={drawn ? "warn" : undefined} />;
}

/** Cover cooldown + guard-release toggle (the /puszczaj alias). Click toggles guard. */
export function CoverChip() {
  const [guard, setGuard] = useState(true);
  const [cover, setCover] = useState<number | null>(null);
  useClientEvent<boolean>("releaseGuard", (v) => setGuard(Boolean(v)));
  useClientEvent<number | null>("coverTimer", (v) => setCover(v));
  const active = cover != null && cover > 0;
  return (
    <Chip
      icon={<ChipIcon name="shield" />}
      label="Zaslona"
      value={active ? cover!.toFixed(1) : "OK"}
      tone={active ? "warn" : "ok"}
      title="Przelacz puszczanie zaslon"
      onClick={() => eventBus.emit("releaseGuard", !guard)}
    />
  );
}

/** Team-order cooldown (leader only). */
export function OrderChip() {
  const [leader, setLeader] = useState(false);
  const [order, setOrder] = useState<number | null>(null);
  useClientEvent<boolean>("isTeamLeader", (v) => setLeader(Boolean(v)));
  useClientEvent<number | null>("orderTimer", (v) => setOrder(v));
  if (!leader) return null;
  const active = order != null && order > 0;
  return <Chip icon={<ChipIcon name="banner" />} label="Rozkaz" value={active ? order!.toFixed(2) : "OK"} tone={active ? "warn" : "ok"} />;
}

/**
 * "Item about to break" warning. Shows the game's warning text; clicking fires
 * the repair command (when the game supplied one) and dismisses the chip until
 * the next warning — mirroring the stock BreakItemWarning.
 */
export function BreakItemChip() {
  const [data, setData] = useState<{ text: string; command?: string } | null>(null);
  useClientEvent<{ text: string; command?: string } | null>("breakItem", (v) => setData(v));
  if (!data) return null;
  const onClick = data.command
    ? () => { eventBus.emit("sendCommand", { command: data.command! }); setData(null); }
    : undefined;
  return (
    <Chip
      icon={<ChipIcon name="warn" />}
      label="Uwaga"
      value={data.text}
      tone="danger"
      title={onClick ? "Napraw sprzet" : undefined}
      onClick={onClick}
    />
  );
}
