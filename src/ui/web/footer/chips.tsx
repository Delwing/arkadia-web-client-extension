import { useState } from "react";
import eventBus from "@modules/core/eventBus";
import type { PackageStatus } from "@shared/events/clientEvents";
import { TRANSPORT_SOON_SECONDS } from "@client/types/transport.ts";
import { useAttentionBlink, useClientEvent } from "../hooks";
import { Chip, type ChipTone } from "./Chip";
import { ChipIcon } from "./icons";

/**
 * The footer status chips.
 *
 * Each chip is a self-contained component subscribing to the client event it
 * reads, rendering pure JSX through the shared <Chip>. A chip returns null when its data is absent, so
 * a strip only ever shows what is currently relevant; Fajka and Lampa are the
 * always-on chips (both double as an on/off switch).
 *
 * These are the building blocks — hosts compose them: the forge HUD renders them
 * through <FooterStrip>, the stock status line through <StatusLine>.
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

/**
 * Oil-lamp fuel remaining, or "off" when it is out. Click lights / snuffs it;
 * a long press tops it up with oil whatever state it is in.
 */
export function LampChip() {
  const [seconds, setSeconds] = useState<number | null>(null);
  useClientEvent<number | null>("lampTimer", (v) => setSeconds(v));
  const lit = seconds != null && seconds > 0;
  const tone: ChipTone | undefined = !lit ? undefined : seconds! < 30 ? "danger" : seconds! < 60 ? "warn" : "ok";
  return (
    <Chip
      icon={<ChipIcon name="lamp" />}
      label="Lampa"
      value={lit ? mmss(seconds!) : "off"}
      tone={tone}
      title={`${lit ? "Zgas lampe" : "Zapal lampe"} (przytrzymaj: napelnij olejem)`}
      onClick={() => eventBus.emit("sendCommand", { command: lit ? "zgas lampe" : "zapal lampe" })}
      onLongPress={() => eventBus.emit("sendCommand", { command: "napelnij lampe olejem" })}
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
  const tone: ChipTone = remaining == null ? "ok" : remaining < TRANSPORT_SOON_SECONDS ? "danger" : remaining < 30 ? "warn" : "ok";
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

/**
 * Mail waiting to be collected or sent. Click dispatches the courier animal.
 * Blinks for 5s when it appears, then for 5s every minute while it stays.
 */
export function MailChip() {
  const [state, setState] = useState<{ unreceived?: boolean; unsent?: boolean }>({});
  useClientEvent<{ unreceived?: boolean; unsent?: boolean }>("gmcp.mail.state", (s) => setState(s || {}));
  const pending = Boolean(state.unreceived || state.unsent);
  const blinking = useAttentionBlink(pending);
  if (!pending) return null;
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
      className={blinking ? "attention-blink" : undefined}
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

type ClockReading = {
  hours: number;
  minutes: number;
  precision?: number;
  dayLabel?: string;
  daylight?: boolean;
  season?: number;
  sunrise?: number;
  sunset?: number;
};

const SEASON_NAMES = ["wiosna", "lato", "jesien", "zima"];
const SEASON_COLORS = [
  "var(--popup-data-spring-green)",
  "var(--popup-data-yellow)",
  "var(--popup-data-orange)",
  "var(--popup-data-blue)",
];

/**
 * Game hours before sunrise that are dawn (still night), and before sunset that
 * are dusk (still day) - a heads-up that the light is about to change.
 */
const TWILIGHT_HOURS = 2;

const SUN_COLOR = "var(--popup-data-gold)";
const MOON_COLOR = "color-mix(in oklab, var(--popup-data-blue) 65%, var(--popup-text))";
const DAWN_COLOR = "var(--popup-data-purple-light)";
const DUSK_COLOR = "var(--popup-data-orange-light)";

function hhmm(hour: number): string {
  const h = Math.floor(hour);
  return `${String(h).padStart(2, "0")}:${String(Math.round((hour - h) * 60)).padStart(2, "0")}`;
}

/**
 * In-game clock (HH:MM, ±precision while it is still an estimate) for the active
 * domain, then the season. The icon tells the time of day - sun, moon, or half a
 * sun on the horizon in the last hours before sunrise and before sunset - and the
 * season name wears the season's colour. Date and sun times ride in the
 * tooltip; a click opens the clock window.
 */
export function ClockChip() {
  const [active, setActive] = useState<Domain | undefined>();
  const [clocks, setClocks] = useState<Record<string, ClockReading>>({});
  useClientEvent<{ domain: Domain }>("clock.domain.active", ({ domain }) => setActive(domain));
  useClientEvent<ClockReading & { domain: Domain }>("clock.update", ({ domain, ...reading }) =>
    setClocks((prev) => ({ ...prev, [domain]: reading })));
  const clock = active ? clocks[active] : undefined;
  if (!clock) return null;
  const time = `${String(clock.hours).padStart(2, "0")}:${String(Math.floor(clock.minutes)).padStart(2, "0")}`;
  const value = clock.precision && clock.precision > 0 ? `${time} ±${clock.precision}` : time;
  const part = clock.daylight === true ? "dzien" : clock.daylight === false ? "noc" : "";
  const season = clock.season !== undefined ? SEASON_NAMES[clock.season] : undefined;
  const now = clock.hours + clock.minutes / 60;
  const { sunrise, sunset } = clock;
  const twilight = sunrise !== undefined && now >= sunrise - TWILIGHT_HOURS && now < sunrise ? "swit"
    : sunset !== undefined && now >= sunset - TWILIGHT_HOURS && now < sunset ? "zmierzch"
    : undefined;
  const icon = clock.daylight === undefined ? "clock" : twilight ? "dawn" : clock.daylight ? "sun" : "moon";
  const iconColor = icon === "clock" ? undefined
    : twilight === "swit" ? DAWN_COLOR : twilight === "zmierzch" ? DUSK_COLOR
    : clock.daylight ? SUN_COLOR : MOON_COLOR;
  const tip = [
    clock.dayLabel,
    season && [season, twilight ?? part].filter(Boolean).join(", "),
    clock.sunrise !== undefined && clock.sunset !== undefined
      ? `wschod ${hhmm(clock.sunrise)}, zachod ${hhmm(clock.sunset)}`
      : undefined,
  ].filter(Boolean).join("\n");
  return (
    <Chip
      icon={<ChipIcon name={icon} color={iconColor} />}
      label={season ?? part}
      labelColor={clock.season !== undefined ? SEASON_COLORS[clock.season] : undefined}
      value={value}
      valueFirst
      title={tip ? `${tip}\n(kliknij: zegar)` : "Zegar"}
      onClick={() => eventBus.emit("clock.popup.open", { domain: active })}
    />
  );
}

/** Whether a weapon is drawn. Neutral either way; red only when fighting without it. */
export function WeaponChip() {
  const [drawn, setDrawn] = useState<boolean | null>(null);
  const [inCombat, setInCombat] = useState(false);
  useClientEvent<boolean>("weapon_state", (v) => setDrawn(Boolean(v)));
  useClientEvent<boolean>("combatState", (v) => setInCombat(Boolean(v)));
  useClientEvent("client.disconnect", () => setInCombat(false));
  if (drawn === null) return null;
  const tone: ChipTone | undefined = inCombat && !drawn ? "danger" : undefined;
  return <Chip icon={<ChipIcon name="sword" />} label="Bron" value={drawn ? "dobyta" : "schowana"} tone={tone} />;
}

/** Cover cooldown + guard-release toggle (the /puszczaj alias). Click toggles guard. */
export function CoverChip() {
  const [guard, setGuard] = useState(true);
  const [cover, setCover] = useState<number | null>(null);
  useClientEvent<boolean>("releaseGuard", (v) => setGuard(Boolean(v)));
  useClientEvent<number | null>("coverTimer", (v) => setCover(v));
  const active = cover != null && cover > 0;
  // Value/tone stay tied to the cover cooldown (countdown + amber while
  // recharging, "OK"/green when ready). The "puszczaj zaslony" toggle is shown
  // separately by tinting the shield in: an outline shield means covers are
  // auto-released (the default), a filled-in shield means the guard is held.
  return (
    <Chip
      icon={<ChipIcon name="shield" fill={!guard} />}
      label="Zaslona"
      value={active ? cover!.toFixed(1) : "OK"}
      tone={active ? "warn" : "ok"}
      title={guard ? "Zaslony puszczane automatycznie (kliknij: trzymaj)" : "Zaslony trzymane (kliknij: puszczaj automatycznie)"}
      className={guard ? undefined : "chip--guard-held"}
      onClick={() => eventBus.emit("releaseGuard", !guard)}
    />
  );
}

/**
 * Round-trip time to the game, plus how far the session proxy's clock sits from ours.
 *
 * A diagnostic pair rather than anything to play by, which is why the chip is hidden
 * unless the player turns it on. The drift half only appears on the session proxy, and
 * only matters because event times come from that machine's clock: MudClient folds the
 * skew out before any script sees a timestamp, and this is where you can see how much
 * it is folding out.
 */
export function ConnectionChip() {
  const [ping, setPing] = useState<number | null>(null);
  const [offset, setOffset] = useState<number | null>(null);
  useClientEvent<number | null>("ping", (v) => setPing(typeof v === "number" ? v : null));
  useClientEvent<number>("proxy.clockOffset", (v) => setOffset(typeof v === "number" ? v : null));
  if (ping == null && offset == null) return null;
  const drift = offset == null ? null : offset / 1000;
  // Sub-half-second drift is the network delay this is measured through, not a clock
  // worth reporting, so the chip only changes colour past that.
  const tone: ChipTone | undefined = offset != null && Math.abs(offset) >= 2000
    ? "danger"
    : offset != null && Math.abs(offset) >= 500
      ? "warn"
      : ping != null && ping >= 400
        ? "warn"
        : "ok";
  const parts: string[] = [];
  if (ping != null) parts.push(`${Math.round(ping)}ms`);
  if (drift != null) parts.push(`${drift >= 0 ? "+" : ""}${drift.toFixed(1)}s`);
  return (
    <Chip
      icon={<ChipIcon name="signal" />}
      label=""
      value={parts.join(" ")}
      tone={tone}
      title={drift == null ? "Ping" : "Ping i zegar proxy wzgledem tego komputera"}
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
  // Always clickable, mirroring the stock BreakItemWarning: a click fires the
  // repair/put-down command when the game supplied one, and always dismisses the
  // chip. Without this the four command-less break warnings render as an inert
  // <div> the user can neither act on nor clear.
  const onClick = () => {
    if (data.command) eventBus.emit("sendCommand", { command: data.command });
    setData(null);
  };
  return (
    <Chip
      icon={<ChipIcon name="warn" />}
      label="Uwaga"
      value={data.text}
      tone="danger"
      title={data.command ? "Napraw sprzet" : "Odrzuc ostrzezenie"}
      onClick={onClick}
    />
  );
}
