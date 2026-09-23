import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FooterItem } from "@modules/core/footerRegistry";
import { useFooterItems } from "./useFooterItems";
import FooterItemView from "./FooterItemView";
import Vitals from "./Vitals";
import { FooterButtonSheet } from "./FooterButtons";

/** Pulled out of the chip flow and shown last, quietly: a diagnostic, not a status. */
const CONNECTION_ID = "connection-status";

/**
 * One chip slot. Keeps the chip's config id as the element id (older code, plugins
 * and the e2e specs find chips by it) and its configured position as `--order`;
 * with `footerUrgentChipsFirst` on, the stylesheet moves urgent chips (danger, then
 * warn) to the front from there, otherwise a chip keeps its slot whatever its tone.
 */
function Slot({ item }: { item: FooterItem }) {
  const plugin = item.source !== "builtin";
  return (
    <span
      id={plugin ? undefined : item.id}
      className={`status-slot${plugin ? " footer-plugin-item" : ""}`}
      data-footer-id={item.id}
      style={{ "--order": item.order } as CSSProperties}
    >
      <FooterItemView item={item} />
    </span>
  );
}

/**
 * The status line of the stock footer: vitals as pip meters, then the chips from the
 * common footer registry (built-ins and plugin items, already filtered and ordered by
 * the player's config), the connection at the end. Chips that do not fit on one
 * line hide behind "+N"; opening it lets the line wrap to show them all. On a phone
 * the same line is folded and unfolded by the footer expander (mobileFooter.ts).
 */
export default function StatusLine() {
  const items = useFooterItems();
  const connection = items.find((item) => item.id === CONNECTION_ID);
  const chips = items.filter((item) => item.id !== CONNECTION_ID);

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
      const shown = slots.filter((slot) => slot.offsetWidth > 0);
      const firstTop = shown.length > 0 ? Math.min(...shown.map((slot) => slot.offsetTop)) : 0;
      let wrapped = 0;
      for (const slot of shown) {
        const past = slot.offsetTop > firstTop + 2;
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
  useLayoutEffect(() => measureRef.current(), [open]);

  return (
    <>
      <div id="char-state-vitals" className="status-vitals">
        <Vitals />
      </div>
      <div id="footer-chips" ref={chipsRef} className={`status-chips${open ? " is-open" : ""}`}>
        {chips.map((item) => <Slot key={item.id} item={item} />)}
      </div>
      {(hidden > 0 || open) && (
        <button
          type="button"
          className="status-more"
          title={open ? "Zwin plakietki" : "Pokaz wszystkie plakietki"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDown size={13} strokeWidth={2.2} /> : <>+{hidden}<ChevronUp size={13} strokeWidth={2.2} /></>}
        </button>
      )}
      {connection && (
        <span className="status-connection">
          <Slot item={connection} />
        </span>
      )}
      <button id="footer-expand" type="button" className="status-expand">
        <ChevronUp size={14} strokeWidth={2.2} />
      </button>
      {/* Phone only (footerMobile.css shows it): the sheet's button grid. */}
      <FooterButtonSheet />
    </>
  );
}
