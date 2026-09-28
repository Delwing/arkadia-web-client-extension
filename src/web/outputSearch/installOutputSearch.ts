import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { isAnyModalOpen } from "@web/modals/appModal.ts";
import { registerMainMenuItem } from "@modules/core/mainMenuRegistry";
import OutputSearchBar from "./OutputSearchBar";
import { isOutputSearchOpen, openOutputSearch } from "./outputSearchState";
import "./outputSearch.css";

interface OutputSearchHost {
    outputWrapper: HTMLElement;
    splitBottom: HTMLElement;
    /** Overlays inside the output that are not game text. */
    skip: Element[];
    commandInput: () => HTMLElement | null;
}

/** What is selected in the output, to search for straight away; one line of it. */
function selectedOutputText(outputWrapper: HTMLElement): string {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode) return "";
    if (!outputWrapper.contains(selection.anchorNode)) return "";
    return selection.toString().split("\n")[0].trim();
}

/**
 * Ctrl+F over the game output (stock UI): the bar, its shortcut and a main menu
 * entry for touch screens, which have no Ctrl.
 *
 * The shortcut listens on window and is installed after the client's keybind
 * listeners, so a player's own bind on Ctrl+F still wins (it cancels the event).
 * Inside another text field, or with a window open, the browser's find is left alone.
 */
export function installOutputSearch(host: OutputSearchHost): void {
    const root = document.createElement("div");
    document.body.appendChild(root);
    createRoot(root).render(createElement(OutputSearchBar, host));

    const open = () => {
        const selected = selectedOutputText(host.outputWrapper);
        const input = document.getElementById("output-search-input") as HTMLInputElement | null;
        if (isOutputSearchOpen() && !selected && input) {
            input.focus();
            input.select();
            return;
        }
        openOutputSearch(selected);
    };

    window.addEventListener("keydown", (e) => {
        if (e.defaultPrevented) return;
        if (e.code !== "KeyF" || !(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
        if (isAnyModalOpen()) return;
        const active = document.activeElement as HTMLElement | null;
        const inTextField = !!active && (active.matches("input, textarea") || active.isContentEditable);
        if (inTextField && active !== host.commandInput() && active.id !== "output-search-input") return;
        e.preventDefault();
        open();
    });

    registerMainMenuItem({
        id: "output-search-button",
        label: "Szukaj w tekście",
        shortLabel: "Szukaj",
        keywords: ["znajdź", "ctrl+f", "wyszukaj"],
        group: "narzedzia",
        icon: "search",
        order: 160,
        onSelect: open,
        source: "builtin",
    });
}
