import { buildHerbContextMenuItems, openHerbContextMenu } from "../src/contextMenus";

describe("buildHerbContextMenuItems", () => {
    const mockClient = {
        sendCommand: jest.fn(),
    } as any;

    it("parses mudlet color codes in herb effects", () => {
        const items = buildHerbContextMenuItems(
            mockClient,
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
            mockClient,
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
            mockClient,
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
        const showContextMenu = jest.fn();
        const clientWithMenu = {
            sendCommand: jest.fn(),
            OutputHandler: { showContextMenu },
        } as any;

        openHerbContextMenu(clientWithMenu, {
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
        expect(showContextMenu.mock.calls[0][0]).toEqual([]);
        expect(showContextMenu.mock.calls[0][3]).toEqual({ header: "Ziolo: rumianek", smallHeader: true });
    });
});
