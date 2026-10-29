import { AppModal } from "./appModal";

/**
 * The page-level windows (app/AppModals.tsx, app/LogsWindow.tsx), by name. What
 * opens or closes one calls these instead of firing a window event at whoever
 * might be listening.
 */
export type PageWindow =
    | "settings"
    | "characters"
    | "binds"
    | "scripts"
    | "automation"
    | "recordings"
    | "places"
    | "helper"
    | "locationShare"
    | "logs";

const IDS: Record<PageWindow, string> = {
    settings: "settings-modal",
    characters: "character-management-modal",
    binds: "binds-modal",
    scripts: "scripts-modal",
    automation: "automation-modal",
    recordings: "recordings-modal",
    places: "places-modal",
    helper: "helper-modal",
    locationShare: "location-share-modal",
    logs: "logs-modal",
};

/** The windows a jump elsewhere (a room on the map, a recording to play) closes. */
const OPTION_WINDOWS: PageWindow[] = ["settings", "binds", "scripts", "automation", "recordings", "places"];

export function openWindow(window: PageWindow): void {
    AppModal.byId(IDS[window])?.show();
}

export function closeWindow(window: PageWindow): void {
    (document.activeElement as HTMLElement | null)?.blur?.();
    AppModal.byId(IDS[window])?.hide();
}

/** Close the option windows, for an action that takes the player back to the game. */
export function closeOptionWindows(): void {
    (document.activeElement as HTMLElement | null)?.blur?.();
    for (const window of OPTION_WINDOWS) AppModal.byId(IDS[window])?.hide();
}
