import { buildHerbContextMenuItems, openHerbContextMenu, openMapContextMenu } from "@modules/core/contextMenus";
import { showContextMenu } from "@web/contextMenu";
import { characterStorage } from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";

vi.mock("@web/contextMenu", () => ({
    showContextMenu: jest.fn(),
}));

const labels = (items: { label: unknown }[]) => items.map(item => item.label);

describe("buildHerbContextMenuItems", () => {
    it("gives each use one row: the verb, its effect under it, the amounts at the end", () => {
        const items = buildHerbContextMenuItems(
            "rumianek",
            [{ action: "zjedz", effect: "<yellow>+15 ZDR<reset>" }],
            "/z",
            [1, 3, 5],
        );

        expect(items[0].label).toBe("zjedz");
        expect(items[0].detail).toBe("+15 ZDR");
        expect(items[0].choices?.map(choice => choice.label)).toEqual(["1", "3", "5"]);
    });

    it("leaves the effect line out when there is none", () => {
        const items = buildHerbContextMenuItems("rumianek", [{ action: "zjedz", effect: "" }], "/z", [1]);

        expect(items[0].detail).toBeUndefined();
    });

    it("an amount emits only the alias command, leaving pre/post-use commands to the alias", () => {
        const emitSpy = jest.spyOn(eventBus, "emit");
        const items = buildHerbContextMenuItems("rumianek", [{ action: "zjedz", effect: "" }], "/zi", [1, 3]);

        items[0].choices![1].action();

        expect(emitSpy).toHaveBeenCalledTimes(1);
        expect(emitSpy).toHaveBeenCalledWith("sendCommand", { command: "/zi zjedz rumianek 3" });
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

        expect(labels(items)).toEqual(["zjedz", "Pokaż w Ziołach"]);
    });

    it("adds 'Nabij fajkę' for smokable herbs, after a separator", () => {
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

        expect(labels(items)).toEqual(["zjedz", "Nabij fajkę", "Pokaż w Ziołach"]);
        const smoke = items[1];
        expect(smoke.separator).toBe(true);
        expect(items[2].separator).toBe(false);

        smoke.action();
        expect(emitSpy).toHaveBeenCalledWith("sendCommand", { command: "/ziola_fajka tyton" });
        emitSpy.mockRestore();
    });

    it("offers only the pipe and the window for smokable-only herbs", () => {
        const items = buildHerbContextMenuItems(
            "gwiazda_poludnia",
            [{ action: ".", effect: "--", dont_bind: true, smokable: true }],
            "/zi",
            [1],
        );

        expect(labels(items)).toEqual(["Nabij fajkę", "Pokaż w Ziołach"]);
        expect(items[0].separator).toBe(false);
    });

    it("ends in 'Pokaż w Ziołach', which opens the window", () => {
        const emitSpy = jest.spyOn(eventBus, "emit");
        const items = buildHerbContextMenuItems("rumianek", [{ action: "zjedz", effect: "" }], "/zi", [1]);
        const last = items[items.length - 1];

        expect(last.opensWindow).toBe(true);
        last.action();
        expect(emitSpy).toHaveBeenCalledWith("sendCommand", { command: "/ziola" });
        emitSpy.mockRestore();
    });
});

describe("openHerbContextMenu", () => {
    afterEach(() => {
        (showContextMenu as jest.Mock).mockClear();
        vi.restoreAllMocks();
    });

    it("heads the menu with the herb and how many the bags hold", () => {
        vi.spyOn(characterStorage, "get").mockReturnValue({
            1: { herbs: { rumianek: 5, arnika: 2 } },
            2: { herbs: { rumianek: 7 } },
        });

        openHerbContextMenu({ herbId: "rumianek", actions: [], x: 10, y: 20, commandPrefix: "/zi" });

        expect((showContextMenu as jest.Mock).mock.calls[0][3]).toEqual({
            header: "rumianek",
            headerMeta: "12 w woreczkach",
            smallHeader: true,
            width: 320,
        });
    });

    it("leaves the count out before the bags were ever counted", () => {
        vi.spyOn(characterStorage, "get").mockReturnValue(null);

        openHerbContextMenu({ herbId: "rumianek", actions: [], x: 10, y: 20, commandPrefix: "/zi" });

        expect((showContextMenu as jest.Mock).mock.calls[0][3].headerMeta).toBeUndefined();
    });
});

describe("openMapContextMenu", () => {
    afterEach(() => (showContextMenu as jest.Mock).mockClear());

    const shown = () => (showContextMenu as jest.Mock).mock.calls[0];

    it("starts with the three big buttons, Idz the primary one", () => {
        openMapContextMenu(7, 0, 0);
        const quick = shown()[0].filter((item: { variant?: string }) => item.variant === "quick");

        expect(labels(quick)).toEqual(["Idź", "Prowadź", "Tu jestem"]);
        expect(quick.map((item: { active?: boolean }) => Boolean(item.active))).toEqual([true, false, false]);
    });

    it("the big buttons walk, lead and set the location", () => {
        const emitSpy = jest.spyOn(eventBus, "emit");
        openMapContextMenu(7, 0, 0);
        const [go, lead, here] = shown()[0];

        go.action();
        lead.action();
        here.action();
        expect(emitSpy.mock.calls).toEqual([
            ["sendCommand", { command: "/idz 7" }],
            ["leadTo", 7],
            ["map.setLocation", { roomId: 7 }],
        ]);
        emitSpy.mockRestore();
    });

    it("marks go under Oznacz; windows come last", () => {
        openMapContextMenu(7, 0, 0);
        const items = shown()[0];

        expect(labels(items.filter((item: { section?: string }) => item.section === "Oznacz")))
            .toEqual(["Skrót", "Notatka", "Przystanek w planie trasy"]);
        expect(labels(items.slice(-2))).toEqual(["Informacje o lokacji", "Otwórz w oknie mapy"]);
        expect(items.slice(-2).every((item: { opensWindow?: boolean }) => item.opensWindow)).toBe(true);
    });

    it("a window's own entries follow the big buttons", () => {
        openMapContextMenu(7, 0, 0, [{ label: "Pokaz w tym oknie", action: () => {} }]);
        const items = shown()[0];

        expect(items[3].label).toBe("Pokaz w tym oknie");
        expect(items[3].separator).toBe(true);
    });

    it("without the map loaded, the header is the room number", () => {
        openMapContextMenu(7, 0, 0);

        expect(shown()[3]).toMatchObject({ header: "Lokacja #7", width: 300 });
    });
});
