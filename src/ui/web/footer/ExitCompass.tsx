import { useState } from "react";
import eventBus from "@modules/core/eventBus";
import { gmcp } from "@client/gmcp";
import { getShortDir, longToShort } from "@shared/map/directions";
import { useClientEvent } from "../hooks";

const SHORT_DIRS = new Set(Object.values(longToShort));

/** The rose, row by row, up and down in a fourth column; `null` is a gap. */
const ROSE: ([string, string] | null)[] = [
  ["nw", "↖"], ["n", "↑"], ["ne", "↗"], ["u", "▲"],
  ["w", "←"], null, ["e", "→"], null,
  ["sw", "↙"], ["s", "↓"], ["se", "↘"], ["d", "▼"],
];

interface Exits {
  standard: Set<string>;
  special: string[];
}

function readExits(info: { exits?: unknown } | undefined): Exits {
  const list = Array.isArray(info?.exits) ? (info.exits as unknown[]).filter((e): e is string => typeof e === "string") : [];
  const standard = new Set<string>();
  const special: string[] = [];
  for (const exit of list) {
    const short = getShortDir(exit);
    if (SHORT_DIRS.has(short)) standard.add(short);
    else special.push(exit);
  }
  return { standard, special };
}

const go = (command: string) => eventBus.emit("sendCommand", { command });

/**
 * The current room's exits (GMCP Room.Info) as a compass rose: a direction
 * that leads somewhere lights up and walks there on a click; special exits
 * ("wyjscie", "brama") line up beside it as buttons of their own.
 */
export default function ExitCompass() {
  const [exits, setExits] = useState(() => readExits(gmcp?.room?.info));
  useClientEvent<{ exits?: unknown }>("gmcp.room.info", (info) => setExits(readExits(info)));

  return (
    <div className="footer-compass">
      <div className="footer-compass__rose">
        {ROSE.map((cell, index) => {
          if (!cell) return <span key={index} className={index === 5 ? "footer-compass__here" : undefined} />;
          const [dir, glyph] = cell;
          const open = exits.standard.has(dir);
          return (
            <button
              key={dir}
              type="button"
              className={`footer-compass__dir${open ? " is-open" : ""}`}
              data-dir={dir}
              disabled={!open}
              title={dir}
              onClick={() => go(dir)}
            >
              {glyph}
            </button>
          );
        })}
      </div>
      {exits.special.length > 0 && (
        <div className="footer-compass__special">
          {exits.special.map((exit) => (
            <button key={exit} type="button" className="footer-compass__exit" title={exit} onClick={() => go(exit)}>
              {exit}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
