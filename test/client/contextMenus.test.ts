import { buildHerbContextMenuItems, openHerbContextMenu } from "@modules/core/contextMenus";
import { showContextMenu } from "@shared/dom/contextMenu";

vi.mock("@shared/dom/contextMenu", () => ({
    showContextMenu: jest.fn(),
}));

describe("buildHerbContextMenuItems", () => {
    it("parses mudlet color codes in herb effects", () => {
        const items = buildHerbContextMenuItems(
            "rumianek",
            [{ action: "zjedz", effect: "<yellow>+15 ZDR<reset>" }],
            "/z",
            [],
            [],
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
            [],
            [],
            [1],
        );

        expect(items[0].label).toBe("zjedz 1");
    });

    it("skips actions marked with dont_bind", () => {
        const items = buildHerbContextMenuItems(
            "rumianek",
            [
                { action: "zjedz", effect: "+15 ZDR" },
                { action: "napoj", effect: "+5 HP", dont_bind: true },
            ],
            "/z",
            [],
            [],
            [1],
        );

        expect(items).toHaveLength(1);
        expect(items[0].label).toBe("zjedz 1 (+15 ZDR)");
    });

    it("shows empty menu with header when no bindable actions remain", () => {
        (showContextMenu as jest.Mock).mockClear();

        openHerbContextMenu({
            herbId: "rumianek",
            actions: [{ action: "napoj", effect: "+5 HP", dont_bind: true }],
            x: 10,
            y: 20,
            commandPrefix: "/zi",
            preUseCommands: [],
            postUseCommands: [],
            amounts: [1],
        });

        expect(showContextMenu).toHaveBeenCalledTimes(1);
        expect((showContextMenu as jest.Mock).mock.calls[0][0]).toEqual([]);
        expect((showContextMenu as jest.Mock).mock.calls[0][3]).toEqual({ header: "Ziolo: rumianek", smallHeader: true });
    });
});
