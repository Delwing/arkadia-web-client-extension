import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FooterItem } from "@modules/core/footerRegistry";
import type { FooterChipsBlock } from "@shared/footerLayoutTypes";
import { useFooterItems } from "./useFooterItems";
import FooterItemView from "./FooterItemView";
import { Chip } from "./Chip";
import { CHIP_NAMES } from "./chipNames";
import { useFooterPreview } from "./layout/previewContext";

/**
 * One chip slot. Keeps the chip's config id as the element id (older code, plugins
 * and the e2e specs find chips by it) and its configured position as `--order`;
 * with `footerUrgentChipsFirst` on, the stylesheet moves urgent chips (danger, then
 * warn) to the front from there, otherwise a chip keeps its slot whatever its tone.
 */
function Slot({ item }: { item: FooterItem }) {
  const plugin = item.source !== "builtin";
  const preview = useFooterPreview();
  return (
    <span
      id={plugin ? undefined : item.id}
      className={`status-slot${plugin ? " footer-plugin-item" : ""}`}
      data-footer-id={item.id}
      style={{ "--order": item.order } as CSSProperties}
    >
      <FooterItemView item={item} />
      {/* The layout editor's preview: a chip with nothing to show yet stands in
          as its name (the preview's stylesheet hides this beside a real one). */}
      {preview && <Chip icon={null} label={item.label ?? CHIP_NAMES[item.id] ?? item.id} value="–" className="footer-preview-sample" />}
    </span>
  );
}

/**
 * One line of chips; those that wrap past it hide behind "+N", and opening that
 * lets the line wrap to show them all.
 */
function FoldedChips({ items, rest, look }: { items: FooterItem[]; rest: boolean; look: string }) {
  const chipsRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);
  const [open, setOpen] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;

  // Chips that wrapped past the first line are counted for "+N" and marked hidden.
  // The row itself does not clip: a chip may draw outside its tile (a plugin's
  // animated companion, smoke), up over the bind row even. Chips come and go with
  // the game, so watch the children too.
  const measureRef = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    const row = chipsRef.current;
    if (!row) return;
    const measure = () => {
      const slots = Array.from(row.children) as HTMLElement[];
      const shown = slots.filter((slot) => slot.offsetWidth > 0 && slot.offsetHeight > 0);
      // A slot is on a later line when it starts below where the first line's
      // shortest slot ends; chips of different heights centre on their line, so
      // their tops alone would differ without any of them having wrapped.
      const firstBottom = shown.length > 0 ? Math.min(...shown.map((slot) => slot.offsetTop + slot.offsetHeight)) : 0;
      let wrapped = 0;
      for (const slot of shown) {
        const past = slot.offsetTop >= firstBottom - 1;
        if (past) wrapped++;
        slot.classList.toggle("is-wrapped", past && !openRef.current);
      }
      setHidden(wrapped);
    };
    measureRef.current = measure;
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(row);
    const mutation = new MutationObserver(measure);
    mutation.observe(row, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, []);
  // The look reshapes every chip without touching what the observers watch.
  useLayoutEffect(() => measureRef.current(), [open, look]);

  return (
    <>
      <div
        id={rest ? "footer-chips" : undefined}
        ref={chipsRef}
        className={`status-chips${look}${open ? " is-open" : ""}`}
      >
        {items.map((item) => <Slot key={item.id} item={item} />)}
      </div>
      {(hidden > 0 || open) && (
        <button
          type="button"
          className="status-more"
          title={open ? "Zwiń plakietki" : "Pokaż wszystkie plakietki"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown size={13} strokeWidth={2.2} /> : <>+{hidden}<ChevronUp size={13} strokeWidth={2.2} /></>}
        </button>
      )}
    </>
  );
}

/**
 * A chip block of the footer layout: the registry items it was given (see
 * {@link FooterChipsBlock.items}), already filtered and ordered by the player's
 * config. A chip still self-hides when its own data is absent, so the zone only
 * shows what is currently relevant.
 *
 * `claimed` holds every id some chip block lists, which `rest` leaves out.
 */
export default function ChipZone({ block, claimed }: { block: FooterChipsBlock; claimed: ReadonlySet<string> }) {
  const all = useFooterItems();
  const rest = block.items === "rest";
  const items = rest
    ? all.filter((item) => !claimed.has(item.id))
    : (block.items as string[])
        .map((id) => all.find((item) => item.id === id))
        .filter((item): item is FooterItem => item !== undefined);

  // The text look rides on the zone, so every chip in it reads "Label: value".
  const look = block.look === "text" ? " footer-chips--text" : "";

  if (block.quiet) {
    if (items.length === 0) return null;
    return (
      <span className="status-connection">
        {items.map((item) => <Slot key={item.id} item={item} />)}
      </span>
    );
  }
  if (block.arrange === "fold") return <FoldedChips items={items} rest={rest} look={look} />;
  if (block.arrange === "grid") {
    return (
      <div
        id={rest ? "footer-chips" : undefined}
        className={`footer-chip-grid${look}`}
        style={{ "--chip-rows": block.rows ?? 4 } as CSSProperties}
      >
        {items.map((item) => <Slot key={item.id} item={item} />)}
      </div>
    );
  }
  return (
    <div id={rest ? "footer-chips" : undefined} className={`footer-strip${look}`}>
      {items.map((item) => <Slot key={item.id} item={item} />)}
    </div>
  );
}
