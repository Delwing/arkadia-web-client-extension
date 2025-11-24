import Client from "@client/Client";
import { getItemSync, setItemSync } from "@modules/core/storage";
import { DEFAULT_ATTACK_COMMAND, normalizeAttackCommand } from "@client/utils/attackCommand";
import { COLOR_OBJECT, getColorLevel } from "./colors.ts";
import { objectListFilters, type EntryContext } from "./objectListFilters.ts";

export default class ObjectList {
    private client: Client;
    private readonly container: HTMLElement | null;
    private readonly content: HTMLElement | null;
    private objectLines: string[] = [];
    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private offsetLeft = 0;
    private offsetTop = 0;
    private pointerId = 0;
    private isMobile = false;
    private pipWindow: DocumentPictureInPictureWindow | null = null;
    private pipDocument: Document | null = null;
    private pipContent: HTMLElement | null = null;
    private pipButton: HTMLButtonElement | null = null;
    private pipStyleObserver: MutationObserver | null = null;
    private pipTitleObserver: MutationObserver | null = null;
    private locationObserver: MutationObserver | null = null;
    private coverTimerObserver: MutationObserver | null = null;
    private pipLocationText = "";
    private pipCoverTimerText = "";
    private pipLastOutputHtml = "";
    private cachedPipHtml = "";
    private attackCommand = DEFAULT_ATTACK_COMMAND;

    constructor(client: Client) {
        this.client = client;
        this.container = document.getElementById("objects-list");
        this.content = this.setupContainer();
        this.isMobile = this.isMobileBrowser();
        const storedSettings = getItemSync("settings")?.settings;
        this.attackCommand = normalizeAttackCommand(storedSettings?.attackCommand);
        this.client.on("settings", (settings) => {
            this.attackCommand = normalizeAttackCommand((settings as any)?.attackCommand);
        });
        this.setupDraggable();
        if (!this.isMobile) {
            this.container?.addEventListener("click", this.onClick);
        }
        window.addEventListener("resize", this.clampToViewport);
        this.client.on("attackQueueChange", () => this.render());
        this.client.on("gmcp.objects.nums", () => this.render());
        this.client.on("gmcp.objects.data", () => this.render());
        this.client.on("gmcp.char.state", () => this.render());
        this.client.on("output-sent", () => this.handleOutputUpdate());
        this.client.on("buffer-sent", () => this.handleOutputUpdate());
        this.initializePipInfoSources();
        this.render();
    }

    private setupContainer() {
        if (!this.container) return null;
        this.container.innerHTML = "";
        const content = document.createElement("div");
        content.className = "objects-list-content";
        this.container.appendChild(content);
        this.setupPictureInPictureControls(content);
        return content;
    }

    private setupDraggable() {
        if (!this.container) return;

        const savedData = getItemSync("objectsListPosition");
        const saved = savedData?.objectsListPosition;
        if (saved) {
            try {
                // eslint-disable-next-line prefer-const -- left and top are conditionally reassigned below
                let { left, top, right, x, y } = saved as any;
                if (left === undefined && (right !== undefined || x !== undefined)) {
                    const oldRight = right ?? x ?? 0;
                    left = window.innerWidth - this.container.offsetWidth - oldRight;
                }
                top = top ?? y;
                if (typeof left === "number") {
                    this.container.style.left = `${left}px`;
                }
                if (typeof top === "number") {
                    this.container.style.top = `${top}px`;
                }
            } catch (e) {
                console.error("Error parsing saved objects list position", e);
            }
        }
        this.clampToViewport();

        this.container.addEventListener("pointerdown", this.onPointerDown);
        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp);
    }

    private onPointerDown = (e: PointerEvent) => {
        if (!this.container) return;
        const target = e.target as HTMLElement | null;
        const pointerType = e.pointerType || "";
        const isMousePointer =
            pointerType === "mouse" || (pointerType === "" && !this.isMobile);
        if (
            isMousePointer &&
            target?.closest(".object-num, .object-desc, .objects-list-controls")
        ) {
            return;
        }
        this.isDragging = true;
        this.pointerId = e.pointerId;
        this.startX = e.clientX;
        this.startY = e.clientY;
        const rect = this.container.getBoundingClientRect();
        this.offsetLeft = rect.left;
        this.offsetTop = rect.top;
        this.container.setPointerCapture(this.pointerId);
        e.preventDefault();
    };

    private onPointerMove = (e: PointerEvent) => {
        if (!this.isDragging || !this.container || e.pointerId !== this.pointerId) return;

        const deltaX = e.clientX - this.startX;
        const deltaY = e.clientY - this.startY;
        const newLeft = this.offsetLeft + deltaX;
        const newTop = this.offsetTop + deltaY;
        const maxLeft = window.innerWidth - this.container.offsetWidth;
        const clampedLeft = Math.min(maxLeft, Math.max(0, newLeft));
        const clampedTop = Math.max(0, newTop);
        this.container.style.left = `${clampedLeft}px`;
        this.container.style.top = `${clampedTop}px`;
    };

    private onPointerUp = (e: PointerEvent) => {
        if (!this.isDragging || !this.container || e.pointerId !== this.pointerId) return;
        this.isDragging = false;
        this.container.releasePointerCapture(this.pointerId);
        const rect = this.container.getBoundingClientRect();
        const position = {
            left: rect.left,
            top: rect.top,
        };
        setItemSync("objectsListPosition", position);
        this.clampToViewport();
    };

    private clampToViewport = () => {
        if (!this.container) return;
        const rect = this.container.getBoundingClientRect();
        const styles = window.getComputedStyle(this.container);
        let newLeft = parseFloat(styles.left || "0");
        let newTop = parseFloat(styles.top || "0");

        const maxLeft = window.innerWidth - this.container.offsetWidth;

        if (rect.right > window.innerWidth) {
            newLeft = maxLeft;
        } else if (rect.left < 0) {
            newLeft = 0;
        }

        if (rect.bottom > window.innerHeight) {
            newTop = window.innerHeight - this.container.offsetHeight;
        } else if (rect.top < 0) {
            newTop = 0;
        }

        newLeft = Math.min(maxLeft, Math.max(0, newLeft));
        newTop = Math.max(0, newTop);
        this.container.style.left = `${newLeft}px`;
        this.container.style.top = `${newTop}px`;
    };

    private isMobileBrowser() {
        return (
            typeof navigator !== "undefined" &&
            /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
            )
        );
    }

    private getEventTargetElement(target: EventTarget | null): Element | null {
        if (!target) return null;
        if (target instanceof Element) {
            return target;
        }
        const pipElementCtor = this.pipDocument?.defaultView?.Element;
        if (pipElementCtor && target instanceof pipElementCtor) {
            return target as Element;
        }
        if (
            typeof (target as Element).closest === "function" &&
            typeof (target as Node).nodeType === "number" &&
            (target as Node).nodeType === Node.ELEMENT_NODE
        ) {
            return target as Element;
        }
        return null;
    }

    private onClick = (e: MouseEvent) => {
        if (this.isMobile) return;
        const target = this.getEventTargetElement(e.target);
        if (!target) return;
        if (target.closest(".objects-list-controls")) {
            return;
        }
        const numEl = target.closest(
            ".object-num[data-object-num]"
        ) as HTMLElement | null;
        if (numEl) {
            const id = numEl.getAttribute("data-object-id");
            if (id) {
                this.client.sendCommand(`${this.attackCommand} ob_${id}`);
            } else {
                const num = numEl.getAttribute("data-object-num");
                if (num) {
                    this.client.sendCommand(`/z ${num}`);
                }
            }
            return;
        }
        const descEl = target.closest(
            ".object-desc[data-object-num]"
        ) as HTMLElement | null;
        if (descEl) {
            const num = descEl.getAttribute("data-object-num");
            if (num) {
                this.client.sendCommand(`/za ${num}`);
            }
        }
    };

    private render() {
        if (!this.container || !this.content) return;
        const manager = this.client.ObjectManager;
        if (!manager) return;
        const objects = manager.getObjectsOnLocation();

        // Show placeholder if no objects
        if (objects.length === 0) {
            this.objectLines = [];
            this.content.innerHTML = '<span style="color: #888; font-style: italic;">Brak obiektów</span>';
            this.rebuildPictureInPictureHtml();
            return;
        }
        const descWidth = Math.max(0, ...objects.map((o: any) => (o.desc || "").length));
        const tm = this.client.TeamManager;
        const nextQueuedId = tm?.getEnemyQueue?.()?.[0];

        // Debug logging
        if (nextQueuedId !== undefined) {
            console.log('[ObjectList] Queue has next ID:', nextQueuedId);
            console.log('[ObjectList] Current object IDs:', objects.map((o: any) => o.num));
        }

        // Verify the queued enemy actually exists in the current object list
        const queuedEnemyExists = nextQueuedId !== undefined &&
            objects.some((o: any) => typeof o.num !== "undefined" && o.num === nextQueuedId);
        const validNextQueuedId = queuedEnemyExists ? nextQueuedId : undefined;

        if (nextQueuedId !== undefined && !queuedEnemyExists) {
            console.warn('[ObjectList] Queued enemy', nextQueuedId, 'not found in current object list');
        }

        const teamAttacking = objects.some((o: any) => {
            return tm?.isInTeam?.(o.desc) && o.attack_num !== false && o.attack_num !== undefined;
        });

        const lines = objects.map((obj: any) => {
            const num = String(obj.shortcut);
            const isPlayer = obj.shortcut === '@';
            let prefix = "  ";
            if (obj.attack_target) {
                prefix = `<span style="color:orangered">>></span>`;
            } else if (obj.defense_target) {
                prefix = `<span style="color:greenyellow">>></span>`;
            }
            const isNextQueued =
                !isPlayer &&
                validNextQueuedId !== undefined &&
                typeof obj.num !== "undefined" &&
                validNextQueuedId === obj.num;
            const numClasses = ["object-num"];
            if (isNextQueued) {
                numClasses.push("object-num-next-target");
            }
            const numStyle = isNextQueued ? " style=\"color:#ffd700\"" : "";
            let numLabel = isPlayer
                ? `${prefix}${num}`
                : `${prefix}<span class="${numClasses.join(" ")}" data-object-id="${obj.num}" data-object-num="${num}"${numStyle}>${num}</span>`;
            const rawDesc = obj.desc || "";
            const isTeammate = tm?.isInTeam?.(rawDesc);
            const isAttacking = obj.attack_num !== false && obj.attack_num !== undefined;

            // Apply filters before rendering
            const filterContext: EntryContext = {
                object: obj,
                displayNum: parseInt(num, 10),
                isTarget: obj.avatar_target || false,
                isNextTarget: isNextQueued,
                isTeammate: isTeammate || false,
                rawDescription: rawDesc,
                isAttacking,
                attackCommand: this.attackCommand
            };
            const filterResult = objectListFilters.apply(filterContext);

            // Use filtered number label if provided
            if (filterResult.content?.numberLabel !== undefined) {
                numLabel = filterResult.content.numberLabel;
            }

            // Build description with filter overrides
            let descriptionColor: string | undefined;
            let descClasses = [] as string[];

            // Default color logic
            if (!isPlayer) {
                if (obj.avatar_target) {
                    descriptionColor = "#ffaaaa";
                } else if (isTeammate) {
                    descriptionColor = "springgreen";
                    if (teamAttacking && !isAttacking) {
                        descClasses.push("team-not-attacking");
                    }
                } else if (
                    typeof obj.hp === "number" &&
                    isAttacking
                ) {
                    descriptionColor = "#b19cd9";
                }
            }

            // Apply filter color override
            if (filterResult.style?.descriptionColor) {
                descriptionColor = filterResult.style.descriptionColor;
            }

            // Apply filter italic override (via CSS class)
            if (filterResult.style?.italic) {
                descClasses.push("team-not-attacking"); // This CSS class applies italic style
            }

            // Apply filter CSS classes
            if (filterResult.style?.cssClasses) {
                descClasses.push(...filterResult.style.cssClasses);
            }

            // Use filtered description if provided
            const displayDesc = filterResult.content?.description !== undefined
                ? filterResult.content.description
                : rawDesc;

            // Build colored description
            let coloredDesc = displayDesc;
            if (!isPlayer && descriptionColor) {
                const classAttr = descClasses.length ? ` class="${descClasses.join(" ")}"` : "";
                coloredDesc = `<span${classAttr} style="color:${descriptionColor}">${displayDesc}</span>`;
            }

            const padding = " ".repeat(Math.max(0, descWidth - rawDesc.length));
            const isTeammateStr = isTeammate ? "true" : "false";
            const desc = isPlayer
                ? `${displayDesc}${padding}`
                : `<span class="object-desc" data-object-id="${obj.num}" data-object-num="${num}" data-object-desc="${rawDesc}" data-teammate="${isTeammateStr}">${coloredDesc}</span>${padding}`;

            // Build HP bar with filter override
            let bar = "";
            if (filterResult.content?.hpBar !== undefined) {
                bar = filterResult.content.hpBar;
            } else if (typeof obj.hp === "number") {
                const hp = Math.max(0, Math.min(6, obj.hp)) + 1;
                const colorLevel = getColorLevel(hp, 7, false, true);
                let color = COLOR_OBJECT[colorLevel];

                // Apply filter HP bar color override
                if (filterResult.style?.hpBarColor) {
                    color = filterResult.style.hpBarColor;
                }

                const filled = "#".repeat(hp);
                const empty = "-".repeat(7 - hp);
                bar = `[<span style="color:${color}">${filled}${empty}</span>]`;
            }

            const attackers = objects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => o.shortcut);
            const arrow = attackers.length ? ` <- ${attackers.join(" ")}` : "";

            // Apply prefix and suffix from filters (only to description)
            const customPrefix = filterResult.style?.prefix || "";
            const customSuffix = filterResult.style?.suffix || "";

            return `${numLabel} ${bar} ${customPrefix}${desc}${customSuffix}${arrow}`.trimEnd();
        });
        this.objectLines = lines;
        this.content.innerHTML = lines.join("<br>");
        this.rebuildPictureInPictureHtml();
    }

    private setupPictureInPictureControls(content: HTMLElement) {
        if (!this.container) return;
        if (this.container.querySelector("#objects-list-pip-button")) {
            return;
        }
        const pip = window.documentPictureInPicture;
        if (!pip) {
            return;
        }
        this.container.classList.add("objects-list-pip-supported");
        const controls = document.createElement("div");
        controls.className = "objects-list-controls";
        const button = document.createElement("button");
        button.type = "button";
        button.id = "objects-list-pip-button";
        button.className = "objects-list-button";
        button.title = "Picture-in-Picture";
        button.innerHTML = `<span>⤢</span>`;
        button.addEventListener("click", this.togglePictureInPicture);
        controls.appendChild(button);
        this.container.insertBefore(controls, content);
        this.pipButton = button;
    }

    private togglePictureInPicture = async (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.pipWindow) {
            this.closePictureInPicture();
            return;
        }
        await this.openPictureInPicture();
    };

    private async openPictureInPicture() {
        if (!this.container || !this.content) return;
        const pip = window.documentPictureInPicture;
        if (!pip) {
            return;
        }
        try {
            const pipWindow = await pip.requestWindow({
                width: Math.max(320, this.container.offsetWidth || 0),
                height: Math.max(240, this.container.offsetHeight || 0),
            });
            this.pipWindow = pipWindow;
            this.pipDocument = pipWindow.document;
            this.pipWindow.addEventListener("pagehide", this.handlePictureInPictureClose);
            this.observePictureInPictureTitle();
            const pipContent = this.pipDocument.createElement("div");
            pipContent.id = "objects-list-pip";
            pipContent.className = "objects-list-content";
            this.pipDocument.body.appendChild(pipContent);
            this.pipContent = pipContent;
            if (!this.isMobile) {
                this.pipContent.addEventListener("click", this.onClick);
            }
            this.injectPictureInPictureStyles();
            this.pipContent.innerHTML = this.cachedPipHtml;
            this.syncPictureInPictureStyles();
            this.observePictureInPictureStyles();
            this.updatePictureInPictureButton(true);
        } catch (err) {
            console.error("Failed to open objects list Picture-in-Picture", err);
        }
    }

    private closePictureInPicture() {
        if (!this.pipWindow) return;
        const pipWindow = this.pipWindow;
        this.cleanupPictureInPicture();
        try {
            pipWindow.close();
        } catch (err) {
            console.error("Failed to close objects list Picture-in-Picture", err);
        }
    }

    private handlePictureInPictureClose = () => {
        this.cleanupPictureInPicture();
    };

    private cleanupPictureInPicture() {
        const pipWindow = this.pipWindow;
        if (pipWindow) {
            pipWindow.removeEventListener("pagehide", this.handlePictureInPictureClose);
        }
        if (this.pipContent && !this.isMobile) {
            this.pipContent.removeEventListener("click", this.onClick);
        }
        this.pipStyleObserver?.disconnect();
        this.pipStyleObserver = null;
        this.pipTitleObserver?.disconnect();
        this.pipTitleObserver = null;
        this.pipWindow = null;
        this.pipDocument = null;
        this.pipContent = null;
        this.updatePictureInPictureButton(false);
    }

    private updatePictureInPictureButton(active: boolean) {
        if (!this.pipButton) return;
        if (active) {
            this.pipButton.classList.add("objects-list-button-active");
        } else {
            this.pipButton.classList.remove("objects-list-button-active");
        }
    }

    private observePictureInPictureStyles() {
        if (!this.container || !this.pipDocument) return;
        this.pipStyleObserver?.disconnect();
        this.pipStyleObserver = new MutationObserver(() => {
            this.syncPictureInPictureStyles();
        });
        this.pipStyleObserver.observe(this.container, {
            attributes: true,
            attributeFilter: ["style", "class"],
        });
        if (document.body) {
            this.pipStyleObserver.observe(document.body, {
                attributes: true,
                attributeFilter: ["style", "class"],
            });
        }
        this.syncPictureInPictureStyles();
    }

    private syncPictureInPictureStyles = () => {
        if (!this.container || !this.pipDocument) return;
        const containerStyles = window.getComputedStyle(this.container);
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
            const contentStyles = this.content ? window.getComputedStyle(this.content) : containerStyles;
            this.pipContent.style.whiteSpace = contentStyles.whiteSpace;
            this.pipContent.style.fontFamily = contentStyles.fontFamily;
            this.pipContent.style.fontSize = contentStyles.fontSize;
            this.pipContent.style.color = contentStyles.color;
        }
    };

    private observePictureInPictureTitle() {
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

    private injectPictureInPictureStyles() {
        if (!this.pipDocument) return;
        const existing = this.pipDocument.head.querySelector<HTMLStyleElement>(
            "style[data-objects-list-pip]"
        );
        if (existing) {
            return;
        }
        const styleEl = this.pipDocument.createElement("style");
        styleEl.setAttribute("data-objects-list-pip", "true");
        styleEl.textContent = `:root { color-scheme: dark; }
html, body {
    margin: 0;
    height: 100%;
}
#objects-list-pip {
    white-space: pre;
    box-sizing: border-box;
    max-width: 100vw;
    overflow-x: hidden;
    height: 100%;
    display: flex;
    flex-direction: column;
}
#objects-list-pip .objects-list-pip-body {
    flex: 1 1 auto;
    overflow-y: auto;
    white-space: inherit;
}
#objects-list-pip .objects-list-pip-header {
    display: block;
    font-weight: 600;
    margin-bottom: 0.35rem;
}
#objects-list-pip .objects-list-pip-footer {
    display: block;
    margin-top: 0.35rem;
    color: #d0d0d0;
}
#objects-list-pip .objects-list-pip-footer-content {
    display: block;
}
#objects-list-pip .object-num,
#objects-list-pip .object-desc {
    cursor: pointer;
}
#objects-list-pip .team-not-attacking {
    font-style: italic;
}`;
        this.pipDocument.head.appendChild(styleEl);
    }

    private initializePipInfoSources() {
        const locationElement = document.getElementById("location-text");
        if (locationElement && typeof MutationObserver !== "undefined") {
            this.locationObserver?.disconnect();
            this.locationObserver = new MutationObserver(() => {
                this.updateLocationText(locationElement.textContent || "");
            });
            this.locationObserver.observe(locationElement, {
                childList: true,
                characterData: true,
                subtree: true,
            });
            this.updateLocationText(locationElement.textContent || "");
        } else {
            this.locationObserver = null;
        }

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

    private handleOutputUpdate = () => {
        this.updateLastOutputLineFromDom();
    };

    private updateLocationText(text: string) {
        const normalized = text.trim();
        if (normalized === this.pipLocationText) {
            return;
        }
        this.pipLocationText = normalized;
        this.rebuildPictureInPictureHtml();
    }

    private updateCoverTimerText(text: string) {
        const normalized = text.trim();
        if (normalized === this.pipCoverTimerText) {
            return;
        }
        this.pipCoverTimerText = normalized;
        this.rebuildPictureInPictureHtml();
    }

    private updateLastOutputLineFromDom() {
        const wrapper = document.getElementById("main_text_output_msg_wrapper");
        if (!wrapper) {
            if (this.pipLastOutputHtml !== "") {
                this.pipLastOutputHtml = "";
                this.rebuildPictureInPictureHtml();
            }
            return;
        }
        const outputs: string[] = [];
        for (let i = wrapper.children.length - 1; i >= 0 && outputs.length < 2; i--) {
            const child = wrapper.children[i] as HTMLElement;
            if (child && child.classList && child.classList.contains("output_msg")) {
                const textEl = child.querySelector<HTMLElement>(".output_msg_text");
                if (textEl) {
                    const content = textEl.querySelector<HTMLElement>('.output_msg_content');
                    const sourceHtml = content ? content.innerHTML : textEl.innerHTML;
                    const lines = this.splitOutputHtmlIntoLines(sourceHtml);
                    for (let j = lines.length - 1; j >= 0 && outputs.length < 2; j--) {
                        outputs.unshift(lines[j]);
                    }
                }
            }
        }
        const lastHtml = outputs.join("<br>");
        if (lastHtml === this.pipLastOutputHtml) {
            return;
        }
        this.pipLastOutputHtml = lastHtml;
        this.rebuildPictureInPictureHtml();
    }

    private rebuildPictureInPictureHtml() {
        this.cachedPipHtml = this.buildPictureInPictureHtml();
        if (this.pipContent) {
            this.pipContent.innerHTML = this.cachedPipHtml;
            this.syncPictureInPictureStyles();
        }
    }

    private buildPictureInPictureHtml() {
        const lines = [...this.objectLines];
        const header = this.buildPipHeaderHtml();
        const footer = this.buildPipFooterHtml();
        const body = `<div class="objects-list-pip-body">${lines.join("<br>")}</div>`;
        const parts = [] as string[];
        if (header) {
            parts.push(header);
        }
        parts.push(body);
        if (footer) {
            parts.push(footer);
        }
        return parts.join("");
    }

    private buildPipHeaderHtml() {
        const parts = [] as string[];
        if (this.pipLocationText) {
            parts.push(this.escapeHtml(this.pipLocationText));
        }
        if (this.pipCoverTimerText) {
            parts.push(this.escapeHtml(this.pipCoverTimerText));
        }
        if (!parts.length) {
            return "";
        }
        const content = parts.join("&nbsp;&bull;&nbsp;");
        return `<div class="objects-list-pip-header">${content}</div>`;
    }

    private buildPipFooterHtml() {
        if (!this.pipLastOutputHtml) {
            return "";
        }
        return `<div class="objects-list-pip-footer"><div class="objects-list-pip-footer-content">${this.pipLastOutputHtml}</div></div>`;
    }

    private splitOutputHtmlIntoLines(html: string): string[] {
        const lines: string[] = [];
        const stack: { open: string; close: string }[] = [];
        let line = "";
        const regex = /(<[^>]+>|\r?\n)/g;
        let last = 0;
        let match: RegExpExecArray | null;
        const hasVisibleContent = (value: string) =>
            value
                .replace(/<[^>]+>/g, "")
                .replace(/&nbsp;/gi, " ")
                .trim().length > 0;
        while ((match = regex.exec(html)) !== null) {
            const token = match[0];
            line += html.slice(last, match.index);
            if (token === "\n" || token === "\r\n" || /^<br\b[^>]*>$/i.test(token)) {
                const closedLine = line + stack.map(s => s.close).reverse().join("");
                if (hasVisibleContent(closedLine)) {
                    lines.push(closedLine);
                }
                line = stack.map(s => s.open).join("");
            } else {
                line += token;
                if (token.startsWith("<") && !token.startsWith("</") && !token.endsWith("/>") && !token.startsWith("<!")) {
                    const tag = token.match(/^<([a-zA-Z0-9:-]+)/);
                    if (tag) {
                        stack.push({ open: token, close: `</${tag[1]}>` });
                    }
                } else if (token.startsWith("</")) {
                    stack.pop();
                }
            }
            last = regex.lastIndex;
        }
        line += html.slice(last);
        if (hasVisibleContent(line)) {
            lines.push(line);
        }
        return lines;
    }

    private escapeHtml(text: string) {
        const map: Record<string, string> = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
        };
        return text.replace(/[&<>"']/g, (char) => map[char] || char);
    }
}
