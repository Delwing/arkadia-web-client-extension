import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type KeyboardEvent } from "react";
import {
  Book, Circle, Code, Crosshair, Database, FileText, Keyboard, LayoutGrid, MapPin, Maximize, Menu, Package,
  PanelsTopLeft, Plug, Power, Puzzle, QrCode, Search, Settings, Terminal, Upload, Users, Zap, type LucideProps,
} from "lucide-react";
import { characterStorage } from "@modules/core/storage";
import { getMainMenuItems, subscribeMainMenu, type MainMenuGroup, type MainMenuItem } from "@modules/core/mainMenuRegistry";
import { usePopover } from "@web/layout/hooks/usePopover.ts";
import { useHardwareKeyboard, useMediaQuery } from "@web-ui/hooks";
import { splitOwnIcon } from "@web/pluginLabelIcon.ts";
import { getConnectionView, subscribeConnectionView, type ConnectionView } from "./connectionView";

const ICONS: Record<string, ComponentType<LucideProps>> = {
  terminal: Terminal,
  zap: Zap,
  keyboard: Keyboard,
  "map-pin": MapPin,
  record: (props) => <Circle {...props} fill="currentColor" strokeWidth={0} />,
  users: Users,
  package: Package,
  "qr-code": QrCode,
  settings: Settings,
  layout: PanelsTopLeft,
  grid: LayoutGrid,
  radial: Crosshair,
  upload: Upload,
  code: Code,
  database: Database,
  plug: Plug,
  "file-text": FileText,
  book: Book,
  fullscreen: Maximize,
  power: Power,
};

const GROUP_TITLES: Record<Exclude<MainMenuGroup, "sesja">, string> = {
  gra: "Gra",
  ustawienia: "Ustawienia",
  narzedzia: "Narzędzia",
  wtyczki: "Wtyczki",
};

/** Same breakpoint as the phone footer (footerMobile.css). */
const PHONE_QUERY = "(max-width: 768px), (max-height: 520px) and (pointer: coarse)";

interface Section {
  key: string;
  title: string;
  items: MainMenuItem[];
}

function labelText(item: MainMenuItem): string {
  return typeof item.label === "string" ? item.label : item.label.textContent ?? "";
}

/** Case- and accent-blind, so "zrodla" finds "Źródła danych". */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\u0142/g, "l");
}

function statusText(view: ConnectionView): string {
  if (view.status === "connecting") return "łączenie…";
  if (view.status === "disconnected") return "rozłączony";
  if (view.route === "proxy") return "połączony przez proxy";
  if (view.route === "helper") return "połączony przez helpera";
  return "połączony";
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The ⋯ menu at the end of the command line: a filter (type, Enter runs the first
 * match), the registry's entries in sections with icons, and a bar with the
 * connection and the session actions (Pełny ekran, Rozłącz). On a phone the same
 * panel is a bottom sheet of tiles.
 *
 * Entries come from mainMenuRegistry; built-ins keep their ids (#automation-button…),
 * plugin entries carry data-plugin-menu-entry-id.
 */
export default function MainMenu({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
  const items = useSyncExternalStore(subscribeMainMenu, getMainMenuItems);
  const connection = useSyncExternalStore(subscribeConnectionView, getConnectionView);
  const phone = useMediaQuery(PHONE_QUERY);
  const hardwareKeyboard = useHardwareKeyboard();
  const menu = usePopover({ width: 520, maxHeight: 640, placement: "above", onClose: () => setQuery("") });
  const [query, setQuery] = useState("");
  const filterRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(menu.open);
  }, [menu.open, onOpenChange]);

  // Straight into the filter when there is a keyboard to type on; a phone would
  // pop its keyboard over the tiles.
  const shown = menu.style !== null;

  // The phone sheet stands on the command line rather than covering it, so the
  // menu button that opened it closes it again; the multibinds go under it.
  const [sheetBottom, setSheetBottom] = useState(0);
  useLayoutEffect(() => {
    if (!shown || !phone) return;
    const bar = menu.anchorRef.current?.closest("#input-area");
    if (!bar) return;
    const measure = () => setSheetBottom(Math.max(0, window.innerHeight - bar.getBoundingClientRect().top));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [shown, phone, menu.anchorRef]);

  useLayoutEffect(() => {
    if (shown && hardwareKeyboard && !phone) filterRef.current?.focus();
  }, [shown, hardwareKeyboard, phone]);

  const needle = fold(query.trim());
  const matches = (item: MainMenuItem) =>
    !needle
    || fold(labelText(item)).includes(needle)
    || (item.shortLabel !== undefined && fold(item.shortLabel).includes(needle))
    || !!item.keywords?.some((word) => fold(word).includes(needle));

  const { sections, session, first } = useMemo(() => {
    const byGroup = new Map<MainMenuGroup, MainMenuItem[]>();
    for (const item of items) {
      if (!matches(item)) continue;
      const group = item.group ?? "wtyczki";
      byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
    }
    const take = (group: MainMenuGroup) => byGroup.get(group) ?? [];
    // The phone sheet folds the plugins into Narzędzia to save a heading.
    const list: Section[] = phone
      ? [
          { key: "gra", title: GROUP_TITLES.gra, items: take("gra") },
          { key: "ustawienia", title: GROUP_TITLES.ustawienia, items: take("ustawienia") },
          { key: "narzedzia", title: "Narzędzia i wtyczki", items: [...take("narzedzia"), ...take("wtyczki")] },
        ]
      : (["gra", "ustawienia", "narzedzia", "wtyczki"] as const).map((key) => ({ key, title: GROUP_TITLES[key], items: take(key) }));
    const sections = list.filter((section) => section.items.length > 0);
    const session = items.filter((item) => item.group === "sesja");
    const sessionMatches = take("sesja");
    const first = needle
      ? sections.flatMap((section) => section.items).concat(sessionMatches).find((item) => !item.disabled) ?? null
      : null;
    return { sections, session, first };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, needle, phone]);

  const run = (item: MainMenuItem) => {
    menu.close();
    item.onSelect();
  };

  // ↑↓ walk the entries (from the filter too); Enter in the filter runs the first match.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const buttons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>(".command-menu__item:not(:disabled)") ?? []);
    if (buttons.length === 0) return;
    e.preventDefault();
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown"
      ? (at < 0 ? 0 : Math.min(at + 1, buttons.length - 1))
      : at <= 0 ? -1 : at - 1;
    if (next < 0) filterRef.current?.focus();
    else buttons[next].focus();
  };

  const character = characterStorage.getCharacter();

  return (
    <div className="command-menu" ref={menu.rootRef}>
      <button
        id="menu-button"
        ref={menu.anchorRef}
        type="button"
        title="Menu"
        className={menu.open ? "is-active" : undefined}
        onClick={menu.toggle}
      >
        <Menu size={17} strokeWidth={2.1} />
      </button>
      {menu.style && (
        <>
          {phone && <div className="command-menu__scrim" style={{ bottom: sheetBottom }} onClick={menu.close} />}
          <div
            ref={panelRef}
            className={`popup-popover command-menu__panel${phone ? " command-menu__panel--sheet" : ""}`}
            style={phone ? { bottom: sheetBottom, maxHeight: `calc(100dvh - ${sheetBottom}px - 48px)` } : menu.style}
            onKeyDown={onKeyDown}
          >
            {phone && <span className="command-menu__grip" />}
            {/* No filter on a phone: typing there is slower than tapping a tile. */}
            {!phone && <label className="command-menu__filter">
              <Search size={15} strokeWidth={2.1} />
              <input
                ref={filterRef}
                type="text"
                id="command-menu-filter"
                autoComplete="off"
                spellCheck={false}
                placeholder="Szukaj... (wpisz i Enter)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && first) {
                    e.preventDefault();
                    run(first);
                  }
                }}
              />
            </label>}
            <div className="command-menu__sections">
              {sections.map((section) => (
                <section key={section.key} className="command-menu__section" data-group={section.key}>
                  <span className="command-menu__caption">{section.title}</span>
                  <div className="command-menu__items">
                    {section.items.map((item) => (
                      <MainMenuEntry key={item.id} item={item} tile={phone} first={item === first} onRun={run} />
                    ))}
                  </div>
                </section>
              ))}
              {sections.length === 0 && <p className="command-menu__empty">Nic nie pasuje do „{query.trim()}”</p>}
            </div>
            <div className="command-menu__bar">
              {!phone && (
                <span className="command-menu__status" data-status={connection.status}>
                  <span className="command-menu__status-dot" />
                  {character && <span className="command-menu__status-name">{capitalize(character)}</span>}
                  <span className="command-menu__status-text">{character ? "· " : ""}{statusText(connection)}</span>
                </span>
              )}
              {session.map((item) => (
                <MainMenuEntry key={item.id} item={item} bar first={item === first} onRun={run} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MainMenuEntry({ item, tile, bar, first, onRun }: {
  item: MainMenuItem;
  tile?: boolean;
  bar?: boolean;
  first: boolean;
  onRun: (item: MainMenuItem) => void;
}) {
  // A plugin's own leading icon moves into the icon slot, so it lines up with the stock ones.
  const own = useMemo(() => (item.icon ? null : splitOwnIcon(item.label)), [item.icon, item.label]);
  const Icon = (item.icon && ICONS[item.icon]) || own?.Icon || Puzzle;
  const pluginAttr = item.source === "plugin" ? { "data-plugin-menu-entry-id": item.id } : { id: item.id };
  const classes = ["command-menu__item"];
  if (bar) classes.push("command-menu__item--bar");
  if (item.tone === "danger") classes.push("command-menu__item--danger");
  if (first) classes.push("is-first");
  const label = tile && item.shortLabel ? item.shortLabel : own ? own.rest : item.label;
  return (
    <button
      type="button"
      {...pluginAttr}
      className={classes.join(" ")}
      disabled={item.disabled}
      onClick={() => onRun(item)}
    >
      <span className="command-menu__icon"><Icon size={tile ? 17 : 14} strokeWidth={2.1} /></span>
      <span className="command-menu__label">
        {typeof label === "string" ? label : <NodeLabel node={label} />}
      </span>
    </button>
  );
}

/** A plugin's DOM label, copied in (the plugin keeps its own node). */
function NodeLabel({ node }: { node: Node }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren(node.cloneNode(true));
  }, [node]);
  return <span ref={ref} />;
}
