import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { registerFooterItem, unregisterFooterItem } from "@modules/core/footerRegistry";
import type { FooterLayout as Layout } from "@shared/footerLayoutTypes";
import FooterLayout, { type FooterSkin } from "@web-ui/footer/layout/FooterLayout";
import { claimedChipIds } from "@web-ui/footer/layout/layoutTree";
import { STOCK_FOOTER_LAYOUT } from "@web-ui/footer/layout/presets";
import { stockFooterSkin } from "@web-ui/footer/layout/stockSkin";

const ITEMS = ["test-a", "test-b", "connection-status"];

describe("FooterLayout", () => {
  let container: HTMLElement;
  let root: Root;

  const mount = (layout: Layout, skin: FooterSkin) => {
    act(() => root.render(<FooterLayout layout={layout} skin={skin} />));
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    ITEMS.forEach((id, order) => registerFooterItem({
      id,
      order,
      source: "builtin",
      render: () => <span className="chip">{id}</span>,
    }));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    ITEMS.forEach(unregisterFooterItem);
  });

  it("claims the chips a block lists by name, not those of rest", () => {
    expect([...claimedChipIds(STOCK_FOOTER_LAYOUT)]).toEqual(["connection-status"]);
  });

  it("draws the stock footer as the bind row and the status line", () => {
    mount(STOCK_FOOTER_LAYOUT, stockFooterSkin);

    const binds = container.querySelector("#multi-binds");
    const status = container.querySelector("#char-state");
    expect(binds).not.toBeNull();
    expect(binds?.nextElementSibling).toBe(status);
    expect(status?.querySelector("#char-state-vitals")).not.toBeNull();
    expect(status?.querySelector("#footer-expand")).not.toBeNull();
    // The connection is set apart; rest takes everything else.
    const rest = [...container.querySelectorAll("#footer-chips .status-slot")].map((el) => el.id);
    expect(rest).toEqual(["test-a", "test-b"]);
    expect(container.querySelector(".status-connection #connection-status")).not.toBeNull();
  });

  it("lets the skin wrap bands, part them and draw its own blocks", () => {
    const layout: Layout = {
      bands: [
        { children: [{ type: "block", block: "chips", items: ["test-b"], arrange: "wrap" }] },
        {
          children: [
            { type: "block", block: "reconnect" },
            { type: "block", block: "chips", items: "rest", arrange: "wrap" },
          ],
        },
      ],
    };
    const skin: FooterSkin = {
      band: ({ index, children }) => <section data-band={index}>{children}</section>,
      separator: () => <hr />,
      block: (node) => (node.block === "reconnect" ? <button className="own-reconnect" /> : undefined),
    };
    mount(layout, skin);

    const bands = container.querySelectorAll("section");
    expect(bands).toHaveLength(2);
    expect(container.querySelectorAll("hr")).toHaveLength(1);
    expect(bands[0].textContent).toBe("test-b");
    expect(bands[1].querySelector(".own-reconnect")).not.toBeNull();
    expect(bands[1].querySelector(".footer-strip")?.textContent).toBe("test-aconnection-status");
  });
});
