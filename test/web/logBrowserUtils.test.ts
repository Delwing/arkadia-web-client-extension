import { describe, it, expect, afterEach } from "vitest";
import { collectLogStyles } from "@web/logBrowserUtils";

function injectStyle(css: string): HTMLStyleElement {
  const el = document.createElement("style");
  el.textContent = css;
  document.head.appendChild(el);
  return el;
}

describe("collectLogStyles", () => {
  afterEach(() => {
    document.head.querySelectorAll("style").forEach(el => el.remove());
    document.getElementById("logs-preview")?.remove();
  });

  it("carries the export frame even with no page styles at all", () => {
    // The in-client browser's pane used to be `#logs-preview` and the ZIP /
    // to-disk exports borrowed its rules off the live page. Since the viewer
    // migrated, nothing on the page carries that id or those rules — so the
    // frame has to come from here, or a saved log loses its monospace font
    // and its timestamp column.
    const styles = collectLogStyles();

    expect(styles).toContain("#logs-preview");
    expect(styles).toContain("font-family: monospace");
    expect(styles).toContain("grid-template-columns: max-content 1fr");
    expect(styles).toContain("darkorange");
  });

  it("collects log output rules even when #logs-preview is not mounted", () => {
    // Regression: exporting from the "Zarzadzanie" tab happens while the
    // #logs-preview element is unmounted. Style collection must not bail.
    injectStyle(
      "#logs-preview { background-color: #242424; font-family: monospace; }\n" +
      ".output_msg_text { white-space: pre-wrap; }\n" +
      "#logs-preview .log-time { color: darkorange; }\n" +
      ".unrelated-thing { color: hotpink; }"
    );

    expect(document.getElementById("logs-preview")).toBeNull();

    const styles = collectLogStyles();

    expect(styles).toContain("#logs-preview");
    expect(styles).toContain("font-family: monospace");
    expect(styles).toContain("white-space: pre-wrap");
    expect(styles).toContain("darkorange");
    expect(styles).not.toContain("hotpink");
  });
});
