import { buildHerbContextMenuItems, openHerbContextMenu } from "@modules/core/contextMenus";
import { showContextMenu } from "@web/contextMenu";
import eventBus from "@modules/core/eventBus";

vi.mock("@web/contextMenu", () => ({
    showContextMenu: jest.fn(),
}));

describe("buildHerbContextMenuItems", () => {
    it("parses mudlet color codes in herb effects", () => {
        const items = buildHerbContextMenuItems(
            "rumianek",
            [{ action: "zjedz", effect: "<yellow>+15 ZDR<reset>" }],
            "/z",
            [1],
        );

        expect(items).toHaveLength(1);
        expect(items[0].label).toBe("zjedz 1 (+15 ZDR)");
    });

    it("handles missing effects gracefully", () => {
        const items = buildHerbContextMenuItems(
            "rumianek",
            [{ action: "zjedz", effect: "" }],
            "/z",
            [1],
        );

        expect(items[0].label).toBe("zjedz 1");
    });

    it("emits only the alias command, leaving pre/post-use commands to the alias", () => {
        const emitSpy = jest.spyOn(eventBus, "emit");
        const items = buildHerbContextMenuItems(
            "rumianek",
            [{ action: "zjedz", effect: "" }],
            "/zi",
            [1],
        );

        items[0].action();

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith("sendCommand", { command: "/zi zjedz rumianek 1" });
        emitSpy.mockRestore();
    });

    it("skips actions marked with dont_bind", () => {
        const items = buildHerbContextMenuItems(
            "rumianek",
            [
                { action: "zjedz", effect: "+15 ZDR" },
                { action: "napoj", effect: "+5 HP", dont_bind: true },
            ],
            "/z",
            [1],
        );

        expect(items).toHaveLength(1);
        expect(items[0].label).toBe("zjedz 1 (+15 ZDR)");
    });

    it("adds a 'Nabij fajke' item for smokable herbs alongside bindable actions", () => {
        const emitSpy = jest.spyOn(eventBus, "emit");
        const items = buildHerbContextMenuItems(
            "tyton",
            [
                { action: "zjedz", effect: "+15 ZDR" },
                { action: ".", effect: "--", dont_bind: true, smokable: true },
            ],
            "/zi",
            [1],
        );

        const smoke = items.find(item => item.label === "Nabij fajke");
        expect(smoke).toBeDefined();
        expect(items.some(item => item.label.startsWith("zjedz"))).toBe(true);

        smoke!.action();
        expect(emitSpy).toHaveBeenCalledWith("sendCommand", { command: "/ziola_fajka tyton" });
        emitSpy.mockRestore();
    });

    it("offers only 'Nabij fajke' for smokable-only herbs", () => {
        const items = buildHerbContextMenuItems(
            "gwiazda_poludnia",
            [{ action: ".", effect: "--", dont_bind: true, smokable: true }],
            "/zi",
            [1],
        );

        expect(items).toHaveLength(1);
        expect(items[0].label).toBe("Nabij fajke");
    });

    it("shows empty menu with header when no bindable actions remain", () => {
        (showContextMenu as jest.Mock).mockClear();

        openHerbContextMenu({
            herbId: "rumianek",
            actions: [{ action: "napoj", effect: "+5 HP", dont_bind: true }],
            x: 10,
            y: 20,
            commandPrefix: "/zi",
            amounts: [1],
        });

        expect(showContextMenu).toHaveBeenCalledTimes(1);
        expect((showContextMenu as jest.Mock).mock.calls[0][0]).toEqual([]);
        expect((showContextMenu as jest.Mock).mock.calls[0][3]).toEqual({ header: "Ziolo: rumianek", smallHeader: true });
    });
});
