// What the Picture-in-Picture window shows around the list: the location
// label, the cover timer and the game's last two output lines. Each is kept
// as text and `onChange` fires whenever one of them really changes.

import type Client from "@client/Client";
import eventBus from "@modules/core/eventBus";
import {outputLinesFromEnd} from "@web/output/outputMessageHandler.ts";
import {splitOutputHtmlIntoLines} from "./pipHtml.ts";

export class PipStatus {
    locationText = "";
    coverTimerText = "";
    lastOutputHtml = "";
    private coverTimerObserver: MutationObserver | null = null;

    constructor(client: Client, private readonly onChange: () => void) {
        // The label as the map announces it, not #location-text's DOM: the label
        // renders wherever the map is shown and remounts when the map moves.
        client.on("mapLocationLabel", (text: string) => this.updateLocationText(text ?? ""));
        eventBus.emit("requestMapLocationLabel");

        const coverTimerElement = document.getElementById("cover-timer");
        if (coverTimerElement && typeof MutationObserver !== "undefined") {
            this.coverTimerObserver?.disconnect();
            this.coverTimerObserver = new MutationObserver(() => {
                this.updateCoverTimerText(coverTimerElement.textContent || "");
            });
            this.coverTimerObserver.observe(coverTimerElement, {
                childList: true,
                characterData: true,
                subtree: true,
            });
            this.updateCoverTimerText(coverTimerElement.textContent || "");
        } else {
            this.coverTimerObserver = null;
        }

        this.updateLastOutputLineFromDom();
    }

    private updateLocationText(text: string) {
        const normalized = text.trim();
        if (normalized === this.locationText) {
            return;
        }
        this.locationText = normalized;
        this.onChange();
    }

    private updateCoverTimerText(text: string) {
        const normalized = text.trim();
        if (normalized === this.coverTimerText) {
            return;
        }
        this.coverTimerText = normalized;
        this.onChange();
    }

    /** Re-reads the last two lines from the output window. */
    updateLastOutputLineFromDom() {
        const wrapper = document.getElementById("main_text_output_msg_wrapper");
        if (!wrapper) {
            if (this.lastOutputHtml !== "") {
                this.lastOutputHtml = "";
                this.onChange();
            }
            return;
        }
        const outputs: string[] = [];
        // Walk back from the newest line: listing them all after each append
        // would cost the whole buffer.
        for (const child of outputLinesFromEnd(wrapper)) {
            if (outputs.length >= 2) break;
            if (child.classList.contains("output_msg")) {
                const textEl = child.querySelector<HTMLElement>(".output_msg_text");
                if (textEl) {
                    const content = textEl.querySelector<HTMLElement>('.output_msg_content');
                    const sourceHtml = content ? content.innerHTML : textEl.innerHTML;
                    const lines = splitOutputHtmlIntoLines(sourceHtml);
                    for (let j = lines.length - 1; j >= 0 && outputs.length < 2; j--) {
                        outputs.unshift(lines[j]);
                    }
                }
            }
        }
        const lastHtml = outputs.join("<br>");
        if (lastHtml === this.lastOutputHtml) {
            return;
        }
        this.lastOutputHtml = lastHtml;
        this.onChange();
    }
}
