import { describe, it, expect, vi, beforeEach } from "vitest";

const helper = vi.hoisted(() => ({ supported: true }));
vi.mock("@web/helperDownload", () => ({ isHelperSupported: () => helper.supported }));

import { registerBuiltinMainMenu, type MainMenuActions } from "@web/menu/mainMenu";
import { getMainMenuItems, unregisterMainMenuItem } from "@modules/core/mainMenuRegistry";
import eventBus from "@modules/core/eventBus";

function makeActions(connected = false): MainMenuActions {
    return {
        openModal: vi.fn(),
        shareLocation: vi.fn(),
        isConnected: () => connected,
        toggleConnection: vi.fn(),
    };
}

const item = (id: string) => getMainMenuItems().find(i => i.id === id)!;

describe("registerBuiltinMainMenu", () => {
    beforeEach(() => {
        for (const { id } of getMainMenuItems()) unregisterMainMenuItem(id);
        helper.supported = true;
    });

    it("registers the built-in entries with their groups and order", () => {
        registerBuiltinMainMenu(makeActions());
        const ids = getMainMenuItems().map(i => i.id);
        expect(ids).toEqual(expect.arrayContaining([
            "settings-button", "automation-button", "binds-button", "places-button", "recordings-button",
            "people-browser-button", "npc-button", "share-location-button", "scripts-button",
            "data-sources-button", "helper-button", "widgets-button", "docs-button",
            "fullscreen-button", "disconnect-button",
        ]));
        expect(item("settings-button")).toMatchObject({ group: "ustawienia", order: 5, source: "builtin" });
        expect(item("automation-button").order).toBe(10);
        expect(item("helper-button").order).toBe(100);
        expect(item("disconnect-button")).toMatchObject({ group: "sesja", order: 910 });
    });

    it("leaves Helper out where the helper app is not supported", () => {
        helper.supported = false;
        registerBuiltinMainMenu(makeActions());
        expect(getMainMenuItems().some(i => i.id === "helper-button")).toBe(false);
    });

    it("opens the matching modal", () => {
        const actions = makeActions();
        registerBuiltinMainMenu(actions);
        item("binds-button").onSelect();
        item("scripts-button").onSelect();
        expect(actions.openModal).toHaveBeenNthCalledWith(1, "binds");
        expect(actions.openModal).toHaveBeenNthCalledWith(2, "scripts");
    });

    it("settings resumes where it was left, then opens", () => {
        const actions = makeActions();
        registerBuiltinMainMenu(actions);
        item("settings-button").onSelect();
        expect(actions.openModal).toHaveBeenCalledWith("settings");
    });

    it("popups go through the event bus", () => {
        registerBuiltinMainMenu(makeActions());
        const opened = vi.fn();
        const off = eventBus.on("docs.popup.open", opened);
        item("docs-button").onSelect();
        expect(opened).toHaveBeenCalledTimes(1);
        off();
    });

    it("labels the connection entry by state and toggles it", () => {
        const actions = makeActions(true);
        registerBuiltinMainMenu(actions);
        expect(item("disconnect-button").label).toBe("Rozłącz");
        item("disconnect-button").onSelect();
        item("share-location-button").onSelect();
        expect(actions.toggleConnection).toHaveBeenCalledTimes(1);
        expect(actions.shareLocation).toHaveBeenCalledTimes(1);
    });
});
