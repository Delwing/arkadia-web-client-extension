import { useEffect, useState } from "react";
import eventBus from "@modules/core/eventBus";
import { globalStorage } from "@modules/core/storage";
import { useClientEvent, useHardwareKeyboard } from "../hooks";

interface DisplayMultibind {
  index: number;
  action: string;
  label: string;
  /** Display name of a temporary (plugin) bind, shown instead of the action. */
  name?: string;
  temporary?: boolean;
  highlight?: boolean;
}

function getInitialKeepVisible(): boolean {
  return globalStorage.get("uiSettings")?.keepMultibindsVisible === true;
}

/** 'auto' (default) | 'always' | 'never' - see `multibindKeyHints`. */
function getKeyHintMode(): string {
  const mode = globalStorage.get("uiSettings")?.multibindKeyHints;
  return mode === "always" || mode === "never" ? mode : "auto";
}

/**
 * Location binds / multibinds — the row of key-hinted action pills for the
 * current room, fed by the client `multibinds` event (which already merges
 * user multibinds with the room bind and the drinkable bind).
 *
 * Shared between UIs; it emits the stock `.multi-bind` class contract so the
 * stock CSS, its e2e selectors and the split-view hook keep working.
 *
 * Two host modes:
 *  - Stock mounts it directly into the persistent `#multi-binds` container and
 *    passes `onActiveChange`, which toggles that container's `active` class
 *    (the CSS gate + what main.ts's split-view MutationObserver watches). The
 *    row shows only when there are binds, or when `keepMultibindsVisible` is on.
 *  - The forge HUD wraps it in its own always-present band and passes
 *    `alwaysVisible`, so the row keeps a stable height (showing the placeholder
 *    when a room has no binds) and never shifts the plate.
 *
 * Each pill leads with its shortcut ("[ALT+1]"), which on a phone is a hint the
 * player cannot act on, eating the width the action text needs. So the hints are
 * dropped where no keyboard can be found (see @shared/dom/hardwareKeyboard - a
 * phone with a Bluetooth keyboard keeps them, and gets them back the moment it
 * proves itself), and `uiSettings.multibindKeyHints` overrides that guess either
 * way.
 */
export default function MultiBindStrip({
  alwaysVisible = false,
  onActiveChange,
}: {
  alwaysVisible?: boolean;
  onActiveChange?: (active: boolean) => void;
}) {
  const [binds, setBinds] = useState<DisplayMultibind[]>([]);
  const [keepVisible, setKeepVisible] = useState(getInitialKeepVisible);
  const [keyHintMode, setKeyHintMode] = useState(getKeyHintMode);
  const hardwareKeyboard = useHardwareKeyboard();
  const showKeys = keyHintMode === "auto" ? hardwareKeyboard : keyHintMode === "always";

  useClientEvent<{ list?: DisplayMultibind[] }>("multibinds", (payload) => {
    setBinds(Array.isArray(payload?.list) ? payload.list : []);
  });

  useEffect(() => globalStorage.onChange("uiSettings", (settings) => {
    if (typeof settings?.keepMultibindsVisible === "boolean") {
      setKeepVisible(settings.keepMultibindsVisible);
    }
    setKeyHintMode(getKeyHintMode());
  }), []);

  const kept = keepVisible || alwaysVisible;
  const active = binds.length > 0 || kept;

  // Reflect active state to the host (stock toggles `#multi-binds.active`).
  // Block body — the arrow must NOT return onActiveChange's value (classList
  // .toggle returns a boolean, which React would try to invoke as cleanup).
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  if (binds.length === 0) {
    return kept ? <span className="multi-bind-empty">Brak akcji</span> : null;
  }

  return (
    <>
      {binds
        .slice()
        .sort((a, b) => a.index - b.index)
        .map((bind) => {
          const action = bind.action.trim();
          // The multibinds event tags the location's room bind, drinkable bind and
          // gate bind with reserved indexes (5, 6 and 7 — see
          // client/scripts/multibinds.ts), so each UI can colour them apart from the
          // plain numbered multibinds.
          const kind = bind.index === 5
            ? " multi-bind--room"
            : bind.index === 6
              ? " multi-bind--drink"
              : bind.index === 7
                ? " multi-bind--gate"
                : "";
          // Temporary binds (plugins, api.multibinds.addTemporary) read apart from
          // saved ones; a highlighted slot gets a visible border.
          const flags = `${bind.temporary ? " multi-bind--temporary" : ""}${bind.highlight ? " multi-bind--highlight" : ""}`;
          const name = bind.name?.trim();
          return (
            <button
              key={bind.index}
              type="button"
              className={`multi-bind${kind}${flags}`}
              title={name ? `${name}: ${bind.action}` : bind.action}
              disabled={!action}
              onClick={() => {
                if (action) eventBus.emit("sendCommand", { command: bind.action });
              }}
            >
              {showKeys && <span className="multi-bind-key">[{bind.label}]</span>}
              <span className="multi-bind-action">{name || bind.action}</span>
            </button>
          );
        })}
    </>
  );
}
