import { useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { FooterButton } from "@modules/core/footerButtonRegistry";
import { useClientCommand } from "../hooks/useClientCommand";
import { useFooterButtons } from "./useFooterButtons";

function buttonClass(button: FooterButton, extra?: string): string {
  return [
    "footer-button",
    `footer-button--${button.tone}`,
    button.on ? "is-on" : "",
    button.source === "plugin" ? "footer-button--plugin" : "",
    extra,
  ].filter(Boolean).join(" ");
}

/**
 * The player's own buttons in the desktop command bar, between Wyślij and the ⋯
 * menu: one click sends the button's command. A button with a state flag draws
 * itself filled with a dot while that flag is on ("Tryb: podroz"), which a
 * trigger, a script or a plugin turns on.
 *
 * The command line must not lose room to them, so what does not fit in the
 * measured width moves behind a ⋯ of its own rather than wrapping.
 */
/** Room the "..." needs at the right end of the row, in px. */
const MORE_WIDTH = 34;

export default function FooterButtons() {
  const buttons = useFooterButtons();
  const send = useClientCommand();
  const rowRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(buttons.length);
  const [overflowOpen, setOverflowOpen] = useState(false);

  /**
   * How many fit on the one line, measured from the rendered row rather than
   * guessed from the labels. The "..." is positioned out of the row's flow and
   * its width is simply reserved here, so what is measured never depends on
   * whether the "..." is currently there - otherwise showing it would change
   * the answer that put it there.
   */
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const measure = () => {
      const cells = Array.from(row.querySelectorAll<HTMLElement>("[data-footer-button]"));
      if (cells.length === 0) {
        setShown(0);
        return;
      }
      const limit = row.getBoundingClientRect().right;
      const last = cells[cells.length - 1].getBoundingClientRect().right;
      const fits = last <= limit + 1
        ? cells.length
        : cells.filter(cell => cell.getBoundingClientRect().right <= limit - MORE_WIDTH).length;
      setShown(current => (current === fits ? current : fits));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [buttons]);

  if (buttons.length === 0) return null;

  const hidden = buttons.slice(shown);

  return (
    <div id="footer-buttons" className="footer-buttons">
      <div className="footer-buttons__row" ref={rowRef}>
        {buttons.map((button, index) => (
          <button
            key={button.id}
            type="button"
            data-footer-button={button.id}
            className={buttonClass(button, index >= shown ? "is-overflow" : undefined)}
            title={button.command}
            onClick={() => send(button.command)}
          >
            {button.on && <span className="footer-button__dot" />}
            {button.label}
          </button>
        ))}
      </div>
      {hidden.length > 0 && (
        <div className="footer-buttons__more">
          <button
            type="button"
            id="footer-buttons-more"
            className="footer-button footer-button--more"
            title={`Jeszcze ${hidden.length}`}
            onClick={() => setOverflowOpen(open => !open)}
          >
            <MoreHorizontal size={15} strokeWidth={2.1} />
          </button>
          {overflowOpen && (
            <div className="popup-popover footer-buttons__panel">
              {hidden.map(button => (
                <button
                  key={button.id}
                  type="button"
                  data-footer-button-overflow={button.id}
                  className={buttonClass(button, "footer-buttons__panel-item")}
                  onClick={() => { setOverflowOpen(false); send(button.command); }}
                >
                  {button.on && <span className="footer-button__dot" />}
                  {button.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The same buttons in the phone footer sheet: a grid of big targets. The folded
 * footer shows none of them - it is status only, and a button row there would
 * cost the output its height. Without buttons there is no grid at all (they are
 * added in Ustawienia → Stopka).
 */
export function FooterButtonSheet() {
  const buttons = useFooterButtons();
  const send = useClientCommand();

  if (buttons.length === 0) return null;
  return (
    <div id="footer-buttons-sheet" className="footer-buttons-sheet">
      {buttons.map(button => (
        <button
          key={button.id}
          type="button"
          data-footer-button-sheet={button.id}
          className={buttonClass(button, "footer-buttons-sheet__tile")}
          onClick={() => send(button.command)}
        >
          {button.on && <span className="footer-button__dot" />}
          {button.label}
        </button>
      ))}
    </div>
  );
}
