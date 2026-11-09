import { combineExits, useRoomExits, walkExit, type RoomExits } from "../map/roomExits";
import { PREVIEW_EXITS, useFooterPreview } from "./layout/previewContext";

/** The rose, row by row, up and down in a fourth column; `null` is a gap. */
const ROSE: ([string, string] | null)[] = [
  ["nw", "↖"], ["n", "↑"], ["ne", "↗"], ["u", "▲"],
  ["w", "←"], null, ["e", "→"], null,
  ["sw", "↙"], ["s", "↓"], ["se", "↘"], ["d", "▼"],
];

const PREVIEW: RoomExits = combineExits(PREVIEW_EXITS, { specialExits: { "wejdz na gore": 0 } });

/**
 * The current room's exits (GMCP Room.Info) as a compass rose: a direction
 * that leads somewhere lights up and walks there on a click; special exits
 * ("wyjscie", "brama") line up beside it as buttons of their own, followed by
 * the map's special exits the game does not show ("wejdz na gore"), marked as such.
 */
export default function ExitCompass({ showSpecial = true, reserveSpecial = false }: {
  /** Whether the special exits (the game's and the map's) show beside the rose. */
  showSpecial?: boolean;
  /** Keep a fixed-width column for them, even when empty, so the rose does not shift; long names are cut short. */
  reserveSpecial?: boolean;
}) {
  const liveExits = useRoomExits();
  // The layout editor's preview shows a rose with some exits even before a room.
  const preview = useFooterPreview();
  const exits = preview && liveExits.standard.size === 0 && liveExits.special.length === 0 ? PREVIEW : liveExits;
  const special = showSpecial ? exits.special : [];
  const custom = showSpecial ? exits.custom : [];
  const reserve = showSpecial && reserveSpecial;

  return (
    <div className={`footer-compass${reserve ? " footer-compass--reserve" : ""}`}>
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
              onClick={() => walkExit(dir)}
            >
              {glyph}
            </button>
          );
        })}
      </div>
      {(reserve || special.length > 0 || custom.length > 0) && (
        <div className="footer-compass__special">
          {special.map((exit) => (
            <button key={exit} type="button" className="footer-compass__exit" title={exit} onClick={() => walkExit(exit)}>
              {exit}
            </button>
          ))}
          {custom.map((exit) => (
            <button
              key={`map:${exit}`}
              type="button"
              className="footer-compass__exit is-custom"
              title={`${exit} (wyjście z mapy)`}
              onClick={() => walkExit(exit)}
            >
              {exit}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
