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
