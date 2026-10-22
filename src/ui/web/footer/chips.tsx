import { useEffect, useState } from "react";
import eventBus from "@modules/core/eventBus";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings, type Settings } from "@modules/core/defaultSettings";
import type { PackageStatus, PingSample } from "@shared/events/clientEvents";
import { TRANSPORT_SOON_SECONDS } from "@client/types/transport.ts";
import { nextSunEvents, type SunEventType } from "@client/scripts/sunModel.ts";
import { useAttentionBlink, useClientEvent } from "../hooks";
import type { TooltipPart } from "@shared/dom/tooltip.ts";
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
 * These are the building blocks — every UI places them through the footer layout's
 * chip blocks (<ChipZone>, see layout/FooterLayout).
 */

/** M:SS from a seconds count (floored). */
function mmss(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

/*
 * Every state of the fixed-range chips, so they hold one width (see Chip's
 * `sizeTo`). Digits are tabular, so "8" stands for any digit; the counts are the
 * timers' ceilings - lamp 5:00, combat 32s, zask ~30s, cover 5s, order 15s.
 * The transport chip sizes to its own name plus "88:88"; mail and package
 * chips hug their text.
 */
const FAJKA_SIZES = ["pali się", "zgasła"];
const LAMP_SIZES = ["8:88", "off"];
// The longest warning is 16:00.
const SPELL_SIZES = ["88:88"];
const COMBAT_SIZES = ["88"];
const ZASK_SIZES = ["88", "OK"];
const ATTACK_SIZES = ["A", "AW", "AWR"];
const WEAPON_SIZES = ["dobyta", "schowana"];
const COVER_SIZES = ["8.8", "OK"];
const ORDER_SIZES = ["88.88", "OK"];
// A floor, not a cap: a longer value (a team with names missing) still grows.
const TEAM_SIZES = ["Wszyscy [88]"];
const APOCALYPSE_SIZES = ["88:88"];
const CLOCK_SIZES = ["88:88"];
// The label is the season, or the part of the day before a season is known.
const CLOCK_LABEL_SIZES = ["wiosna", "lato", "jesień", "zima", "dzień", "noc"];

/** Pipe: lit ember when puffed, dim when out. Click lights / snuffs it. */
export function FajkaChip() {
  const [lit, setLit] = useState(false);
  useClientEvent<boolean>("pipeLit", (v) => setLit(Boolean(v)));
  return (
    <Chip
      icon={<span className="chip__ico"><span className={`chip__ember${lit ? " chip__ember--lit" : ""}`} /></span>}
      label="Fajka"
      value={lit ? "pali się" : "zgasła"}
      sizeTo={FAJKA_SIZES}
      tone={lit ? "warn" : undefined}
      tip={{ header: "Fajka", click: lit ? "zgaś fajkę" : "zapal fajkę" }}
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
      sizeTo={LAMP_SIZES}
      tone={tone}
      tip={{
        header: "Lampa",
        rows: [{ label: "Paliwo", content: lit ? `na ${mmss(seconds!)}` : "zgaszona" }],
        click: lit ? "zgaś lampę" : "zapal lampę",
        hold: "napełnij olejem",
      }}
      onClick={() => eventBus.emit("sendCommand", { command: lit ? "zgas lampe" : "zapal lampe" })}
      onLongPress={() => eventBus.emit("sendCommand", { command: "napelnij lampe olejem" })}
    />
  );
}

/**
 * One chip per spell we are under, counting down from the game's last warning of
 * how long it has left (scripts/spellEffects). Absent until a spell first warns.
 */
export function SpellEffectsChip() {
  const [effects, setEffects] = useState<{ name: string; seconds: number }[]>([]);
  useClientEvent<{ name: string; seconds: number }[]>("spellEffects", (v) => setEffects(v ?? []));
  if (effects.length === 0) return null;
  return (
    <>
      {effects.map(({ name, seconds }) => {
        const tone: ChipTone = seconds <= 30 ? "danger" : seconds <= 120 ? "warn" : "ok";
        return (
          <Chip
            key={name}
            icon={<ChipIcon name="spark" />}
            label={name}
            value={mmss(seconds)}
            sizeTo={SPELL_SIZES}
            tone={tone}
            tip={{
              header: `Czar: ${name}`,
              rows: [{ label: "Zostało", content: seconds > 0 ? `ok. ${mmss(seconds)}` : "kończy się" }],
            }}
          />
        );
      })}
    </>
  );
}

/** Combat window countdown. */
export function CombatChip() {
  const [seconds, setSeconds] = useState<number | null>(null);
  useClientEvent<number | null>("combatTimer", (v) => setSeconds(v));
  if (seconds == null || seconds <= 0) return null;
  const tone: ChipTone = seconds > 20 ? "danger" : seconds > 10 ? "warn" : "ok";
  return <Chip icon={<ChipIcon name="sword" />} label="Walka" value={seconds} sizeTo={COMBAT_SIZES} tone={tone} />;
}

/** Surprise-attack readiness: OK when charged, else the remaining count. */
export function ZaskChip() {
  const [payload, setPayload] = useState<{ seconds: number; ok: boolean } | null>(null);
  useClientEvent<{ seconds: number; ok: boolean } | null>("zaskTimer", (v) => setPayload(v));
  if (!payload) return null;
  const tone: ChipTone = payload.ok ? "ok" : payload.seconds >= 20 ? "warn" : "danger";
  return <Chip icon={<ChipIcon name="shield" />} label="Zask" value={payload.ok ? "OK" : payload.seconds} sizeTo={ZASK_SIZES} tone={tone} />;
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
  return <Chip icon={<ChipIcon name="target" />} label="Atk" value={mode} sizeTo={ATTACK_SIZES} tip={{ header: "Tryb ataku", click: "A → AW → AWR" }} onClick={cycle} />;
}

/** Team presence on the current room. Click lists the roster. */
export function TeamChip() {
  const [status, setStatus] = useState<{ teamSize: number; missing: string[]; leader?: string }>({ teamSize: 0, missing: [] });
  useClientEvent<{ teamSize: number; missing: string[]; leader?: string }>("teamPanelStatus", (next) =>
    setStatus(next && typeof next.teamSize === "number" ? next : { teamSize: 0, missing: [] }));
  if (status.teamSize === 0) return null;
  const allHere = status.missing.length === 0;
  return (
    <Chip
      icon={<ChipIcon name="team" />}
      label="Drużyna"
      value={allHere ? `Wszyscy [${status.teamSize}]` : `Brak: ${status.missing.join(", ")}`}
      sizeTo={TEAM_SIZES}
      tone={allHere ? "ok" : "warn"}
      tip={{
        header: "Drużyna",
        rows: [
          ...(status.leader ? [{ label: "Prowadzi", content: status.leader }] : []),
          { label: "Członkowie", content: String(status.teamSize) },
          ...(allHere ? [] : [{ label: "Brak", content: status.missing.join(", ") }]),
        ],
        click: "pokaż skład drużyny",
      }}
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
      sizeTo={[`${payload.label} 88:88`]}
      tone={tone}
      tip={{
        header: payload.label,
        rows: remaining == null ? [] : [{ label: "Odjazd za", content: mmss(remaining) }],
        click: "otwórz trasę transportu",
      }}
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
      tip={{
        header: "Paczka",
        rows: [
          { label: "Odbiorca", content: status.recipient },
          ...(time ? [{ label: "Pozostało", content: time.trim() }] : []),
        ],
        click: onClick ? "prowadź do odbiorcy" : undefined,
      }}
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
  if (state.unsent) parts.push("Niewysłana");
  return (
    <Chip
      icon={<ChipIcon name="mail" />}
      label="Poczta"
      value={parts.join(", ")}
      tone="warn"
      tip={{
        header: "Poczta",
        rows: [
          ...(state.unreceived ? [{ label: "", content: "Czeka nowa poczta" }] : []),
          ...(state.unsent ? [{ label: "", content: "Masz niewysłaną pocztę" }] : []),
        ],
        click: "wyślij zwierzę pocztowe",
      }}
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
  return <Chip icon={<ChipIcon name="skull" />} label="Apokalipsa" value={mmss(Math.ceil(seconds))} sizeTo={APOCALYPSE_SIZES} tone="danger" />;
}

type Domain = "Empire" | "Ishtar";

type ClockReading = {
  hours: number;
  minutes: number;
  precision?: number;
  dayLabel?: string;
  daylight?: boolean;
  season?: number;
  dayOfYear?: number;
  sunrise?: number;
  sunset?: number;
};

const SEASON_NAMES = ["wiosna", "lato", "jesień", "zima"];
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

/** A real-world epoch as local HH:MM. */
function realHhmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * A sun row: the game hour in its colour, then the real-world time of the next such
 * event and how far off it is - a game day is 48 real minutes, so never more than that.
 */
function sunTime(hour: number, color: string, realMs: number | undefined): Node {
  const span = document.createElement("span");
  span.append(tinted(hhmm(hour), color));
  if (realMs !== undefined) {
    const minutes = Math.max(0, Math.round((realMs - Date.now()) / 60_000));
    span.append(` · ${realHhmm(realMs)} (za ${minutes} min)`);
  }
  return span;
}

/** Tooltip text in a colour (the hover tooltip takes DOM, not JSX). */
function tinted(text: string, color: string | undefined): Node {
  const span = document.createElement("span");
  span.textContent = text;
  if (color) span.style.color = color;
  return span;
}

/**
 * The game day as a bar for the clock tooltip: midnight to midnight, the daylight
 * stretch between sunrise and sunset lit, a tick where the clock stands now.
 */
function dayBar(now: number, sunrise: number, sunset: number): Node {
  const pct = (hour: number) => `${(Math.min(24, Math.max(0, hour)) / 24) * 100}%`;
  const bar = document.createElement("div");
  bar.className = "chip-tip-daybar";
  const day = document.createElement("span");
  day.className = "chip-tip-daybar__day";
  day.style.left = pct(sunrise);
  day.style.width = `calc(${pct(sunset)} - ${pct(sunrise)})`;
  const mark = document.createElement("span");
  mark.className = "chip-tip-daybar__now";
  mark.style.left = pct(now);
  bar.append(day, mark);
  return bar;
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
  const part = clock.daylight === true ? "dzień" : clock.daylight === false ? "noc" : "";
  const season = clock.season !== undefined ? SEASON_NAMES[clock.season] : undefined;
  const now = clock.hours + clock.minutes / 60;
  const { sunrise, sunset } = clock;
  const twilight = sunrise !== undefined && now >= sunrise - TWILIGHT_HOURS && now < sunrise ? "świt"
    : sunset !== undefined && now >= sunset - TWILIGHT_HOURS && now < sunset ? "zmierzch"
    : undefined;
  const icon = clock.daylight === undefined ? "clock" : twilight ? "dawn" : clock.daylight ? "sun" : "moon";
  const iconColor = icon === "clock" ? undefined
    : twilight === "świt" ? DAWN_COLOR : twilight === "zmierzch" ? DUSK_COLOR
    : clock.daylight ? SUN_COLOR : MOON_COLOR;
  const dayPart = twilight ?? part;
  const rows: TooltipPart[] = [
    { label: "Godzina", content: clock.precision && clock.precision > 0 ? `${time}, ±${clock.precision} min` : time },
  ];
  if (season) rows.push({ label: "Pora roku", content: tinted(season, SEASON_COLORS[clock.season!]) });
  if (dayPart) rows.push({ label: "Pora dnia", content: tinted(dayPart, iconColor) });
  if (sunrise !== undefined && sunset !== undefined) {
    // In-game time against the real clock, for when each next happens out here.
    const real: Partial<Record<SunEventType, number>> = {};
    if (active && clock.dayOfYear !== undefined) {
      const anchor = { domain: active, dayOfYear: clock.dayOfYear, hours: clock.hours, minutes: clock.minutes, realMs: Date.now() };
      for (const event of nextSunEvents(anchor)) real[event.type] = event.realMs;
    }
    rows.push(dayBar(now, sunrise, sunset));
    rows.push({ label: "Wschód", content: sunTime(sunrise, DAWN_COLOR, real.sunrise) });
    rows.push({ label: "Zachód", content: sunTime(sunset, DUSK_COLOR, real.sunset) });
  }
  return (
    <Chip
      icon={<ChipIcon name={icon} color={iconColor} />}
      label={season ?? part}
      labelColor={clock.season !== undefined ? SEASON_COLORS[clock.season] : undefined}
      labelSizeTo={CLOCK_LABEL_SIZES}
      value={value}
      sizeTo={CLOCK_SIZES}
      valueFirst
      tip={{ header: clock.dayLabel ?? "Czas", rows, click: "otwórz okno czasu" }}
      onClick={() => eventBus.emit("clock.popup.open", { domain: active })}
    />
  );
}

interface WeaponChipCommands {
  draw: string;
  sheathe: string;
  hold: string;
}

function readWeaponChipCommands(): WeaponChipCommands {
  const st: Partial<Settings> = characterStorage.get("settings") ?? {};
  const pick = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback).trim();
  return {
    draw: pick(st.weaponChipDrawCommand, defaultSettings.weaponChipDrawCommand),
    sheathe: pick(st.weaponChipSheatheCommand, defaultSettings.weaponChipSheatheCommand),
    hold: pick(st.weaponChipHoldCommand, defaultSettings.weaponChipHoldCommand),
  };
}

/** The character's weapon-chip commands, following edits and character switches. */
function useWeaponChipCommands(): WeaponChipCommands {
  const [commands, setCommands] = useState(readWeaponChipCommands);
  useEffect(() => {
    const reload = () => setCommands(readWeaponChipCommands());
    const offSettings = characterStorage.onChange("settings", reload);
    const offCharacter = characterStorage.onCharacterChange(reload);
    return () => { offSettings(); offCharacter(); };
  }, []);
  return commands;
}

/**
 * Whether a weapon is drawn. Neutral either way; red only when fighting without it.
 * Click sends the character's draw command while sheathed and the sheathe command
 * while drawn (`/dob` and `/op` by default); a long press sends the hold command.
 */
export function WeaponChip() {
  const [drawn, setDrawn] = useState<boolean | null>(null);
  const [inCombat, setInCombat] = useState(false);
  const commands = useWeaponChipCommands();
  useClientEvent<boolean>("weapon_state", (v) => setDrawn(Boolean(v)));
  useClientEvent<boolean>("combatState", (v) => setInCombat(Boolean(v)));
  useClientEvent("client.disconnect", () => setInCombat(false));
  if (drawn === null) return null;
  const tone: ChipTone | undefined = inCombat && !drawn ? "danger" : undefined;
  const click = drawn ? commands.sheathe : commands.draw;
  const send = (command: string) => eventBus.emit("sendCommand", { command });
  return (
    <Chip
      icon={<ChipIcon name="sword" />}
      label="Broń"
      value={drawn ? "dobyta" : "schowana"}
      sizeTo={WEAPON_SIZES}
      sizeCenter
      tone={tone}
      tip={click || commands.hold ? { header: "Broń", click: click || undefined, hold: commands.hold || undefined } : undefined}
      onClick={click ? () => send(click) : undefined}
      onLongPress={commands.hold ? () => send(commands.hold) : undefined}
    />
  );
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
      label="Zasłona"
      value={active ? cover!.toFixed(1) : "OK"}
      sizeTo={COVER_SIZES}
      tone={active ? "warn" : "ok"}
      tip={{
        header: "Zasłona",
        rows: [
          { label: "Gotowa", content: active ? `za ${cover!.toFixed(1)} s` : "teraz" },
          { label: "Zasłony", content: guard ? "puszczane automatycznie" : "trzymane" },
        ],
        click: guard ? "trzymaj zasłony" : "puszczaj zasłony automatycznie",
      }}
      className={guard ? undefined : "chip--guard-held"}
      onClick={() => eventBus.emit("releaseGuard", !guard)}
    />
  );
}

// The ping the chip turns amber at, drawn into the graph as a dashed line.
const PING_WARN_MS = 400;
const PING_GRAPH_SPAN_MS = 5 * 60_000;

/**
 * The last five minutes of ping for the connection tooltip: one line, broken where
 * the connection was down, over a scale from zero to a round ceiling above the peak.
 */
function pingGraph(samples: PingSample[], peak: number): Node {
  const W = 300;
  const H = 60;
  const top = Math.max(100, Math.ceil(peak / 50) * 50);
  const end = samples[samples.length - 1].at;
  const x = (at: number) => (W * (1 - (end - at) / PING_GRAPH_SPAN_MS)).toFixed(1);
  const y = (ms: number) => (H * (1 - Math.min(ms, top) / top)).toFixed(1);
  const runs: PingSample[][] = [];
  samples.forEach((sample, i) => {
    if (i === 0 || sample.restart) runs.push([]);
    runs[runs.length - 1].push(sample);
  });
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const path = (className: string, d: string) => {
    const el = document.createElementNS(ns, "path");
    el.setAttribute("class", className);
    el.setAttribute("d", d);
    svg.appendChild(el);
  };
  if (top > PING_WARN_MS) path("chip-tip-ping__warn", `M0 ${y(PING_WARN_MS)}H${W}`);
  for (const run of runs) {
    const line = run.map((s, i) => `${i ? "L" : "M"}${x(s.at)} ${y(s.ms)}`).join("");
    // A lone sample still needs a visible mark, so the line gets a sliver of length.
    const d = run.length > 1 ? line : `${line}h1`;
    path("chip-tip-ping__area", `${d}V${H}H${x(run[0].at)}Z`);
    path("chip-tip-ping__line", d);
  }
  const graph = document.createElement("div");
  graph.className = "chip-tip-ping";
  const scale = document.createElement("span");
  scale.className = "chip-tip-ping__scale";
  scale.textContent = `${top} ms`;
  graph.append(svg, scale);
  return graph;
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
  const [history, setHistory] = useState<PingSample[]>([]);
  useClientEvent<number | null>("ping", (v) => setPing(typeof v === "number" ? v : null));
  useClientEvent<{ samples: PingSample[] }>("pingHistory", ({ samples }) => setHistory(samples));
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
  const rows: TooltipPart[] = [];
  if (ping != null) rows.push({ label: "Ping", content: `${Math.round(ping)} ms` });
  if (ping != null && history.length > 0) {
    const values = history.map((s) => s.ms);
    const peak = Math.max(...values);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    rows.push(pingGraph(history, peak));
    rows.push({ label: "5 min", content: `min ${Math.round(Math.min(...values))} · śr. ${Math.round(mean)} · maks. ${Math.round(peak)} ms` });
  }
  if (drift != null) rows.push({ label: "Zegar proxy", content: `${drift >= 0 ? "+" : ""}${drift.toFixed(1)} s względem tego komputera` });
  return (
    <Chip
      icon={<ChipIcon name="signal" />}
      label=""
      value={parts.join(" ")}
      tone={tone}
      tip={{ header: "Połączenie", rows }}
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
  return <Chip icon={<ChipIcon name="banner" />} label="Rozkaz" value={active ? order!.toFixed(2) : "OK"} sizeTo={ORDER_SIZES} sizeCenter tone={active ? "warn" : "ok"} />;
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
      tip={{ header: "Uwaga", rows: [{ label: "", content: data.text }], click: data.command ? "napraw sprzęt" : "odrzuć ostrzeżenie" }}
      onClick={onClick}
    />
  );
}
