// The object list's Document Picture-in-Picture window: opening and closing
// it, mirroring the list's look into it, and refilling it (always the list
// flavor, with a status header and footer) whenever the list or the status
// changes. The header button drives it through `objectList.togglePip` and
// follows `objectList.pipActiveChanged`.

import type Client from "@client/Client";
import eventBus from "@modules/core/eventBus";
import type {ObjectListEventHandlers} from "../ObjectListEventHandlers.ts";
import {buildPipHtml} from "./pipHtml.ts";
import {PipStatus} from "./pipStatus.ts";
import {PIP_STYLE_MARKER, PIP_STYLES} from "./pipStyles.ts";

export interface PictureInPictureHost {
    client: Client;
    /** The list window whose size and look the PiP window copies. */
    container: HTMLElement | null;
    content: HTMLElement | null;
    isMobile: boolean;
    handlers: ObjectListEventHandlers;
    /** The list rows to show, already rendered. */
    buildBodyLines(): string[];
}

export class PictureInPictureSync {
    private pipWindow: DocumentPictureInPictureWindow | null = null;
    private pipDocument: Document | null = null;
    private pipContent: HTMLElement | null = null;
    private pipStyleObserver: MutationObserver | null = null;
    private pipTitleObserver: MutationObserver | null = null;
    private readonly status: PipStatus;

    constructor(private readonly host: PictureInPictureHost) {
        this.status = new PipStatus(host.client, () => this.rebuild());
    }

    /** The open window's document, or null. */
    get document(): Document | null {
        return this.pipDocument;
    }

    toggle = async (event?: MouseEvent) => {
        event?.preventDefault();
        event?.stopPropagation();
        if (this.pipWindow) {
            this.close();
            return;
        }
        await this.open();
    };

    /** New game output: only the footer shows it, and opening reads it afresh. */
    handleOutputUpdate = () => {
        if (!this.pipContent) return;
        this.status.updateLastOutputLineFromDom();
    };

    /** Refills the window, if open. */
    rebuild() {
        if (!this.pipContent) {
            return;
        }
        this.pipContent.innerHTML = buildPipHtml({
            locationText: this.status.locationText,
            coverTimerText: this.status.coverTimerText,
            bodyLines: this.host.buildBodyLines(),
            lastOutputHtml: this.status.lastOutputHtml,
        });
        this.syncStyles();
    }

    private async open() {
        const {container, content} = this.host;
        if (!container || !content) return;
        const pip = window.documentPictureInPicture;
        if (!pip) {
            return;
        }
        try {
            const pipWindow = await pip.requestWindow({
                width: Math.max(320, container.offsetWidth || 0),
                height: Math.max(240, container.offsetHeight || 0),
            });
            this.pipWindow = pipWindow;
            this.pipDocument = pipWindow.document;
            this.pipWindow.addEventListener("pagehide", this.handleClose);
            this.observeTitle();
            const pipContent = this.pipDocument.createElement("div");
            pipContent.id = "objects-list-pip";
            pipContent.className = "objects-list-content";
            this.pipDocument.body.appendChild(pipContent);
            this.pipContent = pipContent;
            if (!this.host.isMobile) {
                this.host.handlers.attach(this.pipContent);
            }
            this.injectStyles();
            this.status.updateLastOutputLineFromDom();
            this.rebuild();
            this.observeStyles();
            this.updateButton(true);
        } catch (err) {
            console.error("Failed to open objects list Picture-in-Picture", err);
        }
    }

    private close() {
        if (!this.pipWindow) return;
        const pipWindow = this.pipWindow;
        this.cleanup();
        try {
            pipWindow.close();
        } catch (err) {
            console.error("Failed to close objects list Picture-in-Picture", err);
        }
    }

    private handleClose = () => {
        this.cleanup();
    };

    private cleanup() {
        const pipWindow = this.pipWindow;
        if (pipWindow) {
            pipWindow.removeEventListener("pagehide", this.handleClose);
        }
        if (this.pipContent && !this.host.isMobile) {
            this.host.handlers.detach(this.pipContent);
        }
        this.pipStyleObserver?.disconnect();
        this.pipStyleObserver = null;
        this.pipTitleObserver?.disconnect();
        this.pipTitleObserver = null;
        this.pipWindow = null;
        this.pipDocument = null;
        this.pipContent = null;
        this.updateButton(false);
    }

    private updateButton(active: boolean) {
        // The button lives in the React header; tell it to reflect the state.
        eventBus.emit('objectList.pipActiveChanged', active);
    }

    private observeStyles() {
        if (!this.host.container || !this.pipDocument) return;
        this.pipStyleObserver?.disconnect();
        this.pipStyleObserver = new MutationObserver(() => {
            this.syncStyles();
        });
        this.pipStyleObserver.observe(this.host.container, {
            attributes: true,
            attributeFilter: ["style", "class"],
        });
        if (document.body) {
            this.pipStyleObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ["style", "class"],
            });
        }
        this.syncStyles();
    }

    private syncStyles = () => {
        const {container, content} = this.host;
        if (!container || !this.pipDocument) return;
        const containerStyles = window.getComputedStyle(container);
        const body = this.pipDocument.body;
        body.style.margin = "0";
        body.style.backgroundColor = containerStyles.backgroundColor;
        body.style.color = containerStyles.color;
        body.style.fontFamily = containerStyles.fontFamily;
        body.style.fontSize = containerStyles.fontSize;
        body.style.lineHeight = containerStyles.lineHeight;
        body.style.padding = containerStyles.padding;
        body.style.boxShadow = containerStyles.boxShadow;
        body.style.display = containerStyles.display === "flex" ? "flex" : containerStyles.display;
        body.style.flexDirection = containerStyles.flexDirection;
        body.style.justifyContent = containerStyles.justifyContent;
        body.style.alignItems = containerStyles.alignItems;
        body.style.setProperty("gap", containerStyles.getPropertyValue("gap"));
        body.style.minWidth = containerStyles.minWidth;
        body.style.pointerEvents = "auto";
        body.style.cursor = containerStyles.cursor || "auto";
        const backdrop = containerStyles.getPropertyValue("backdrop-filter");
        if (backdrop) {
            body.style.setProperty("backdrop-filter", backdrop);
        } else {
            body.style.removeProperty("backdrop-filter");
        }
        const webkitBackdrop = containerStyles.getPropertyValue("-webkit-backdrop-filter");
        if (webkitBackdrop) {
            body.style.setProperty("-webkit-backdrop-filter", webkitBackdrop);
        } else {
            body.style.removeProperty("-webkit-backdrop-filter");
        }
        body.style.touchAction = containerStyles.touchAction;
        body.style.boxSizing = containerStyles.boxSizing;
        if (this.pipContent) {
            const contentStyles = content ? window.getComputedStyle(content) : containerStyles;
            this.pipContent.style.whiteSpace = contentStyles.whiteSpace;
            this.pipContent.style.fontFamily = contentStyles.fontFamily;
            this.pipContent.style.fontSize = contentStyles.fontSize;
            this.pipContent.style.color = contentStyles.color;
        }
    };

    private observeTitle() {
        if (!this.pipDocument) return;
        this.pipTitleObserver?.disconnect();
        const updateTitle = () => {
            if (this.pipDocument) {
                this.pipDocument.title = document.title;
            }
        };
        const titleElement = document.querySelector("title");
        if (titleElement) {
            this.pipTitleObserver = new MutationObserver(updateTitle);
            this.pipTitleObserver.observe(titleElement, {
                childList: true,
                characterData: true,
                subtree: true,
            });
        } else {
            this.pipTitleObserver = null;
        }
        updateTitle();
    }

    private injectStyles() {
        if (!this.pipDocument) return;
        const existing = this.pipDocument.head.querySelector<HTMLStyleElement>(
            `style[${PIP_STYLE_MARKER}]`
        );
        if (existing) {
            return;
        }
        const styleEl = this.pipDocument.createElement("style");
        styleEl.setAttribute(PIP_STYLE_MARKER, "true");
        styleEl.textContent = PIP_STYLES;
        this.pipDocument.head.appendChild(styleEl);
    }
}
