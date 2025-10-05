import Client from "@client/src/Client";
import { getItemSync, setItemSync } from "@client/src/storage";
import { COLOR_OBJECT, getColorLevel } from "./colors.ts";

export default class ObjectList {
    private client: Client;
    private readonly container: HTMLElement | null;
    private readonly content: HTMLElement | null;
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

    constructor(client: Client) {
        this.client = client;
        this.container = document.getElementById("objects-list");
        this.content = this.setupContainer();
        this.isMobile = this.isMobileBrowser();
        this.setupDraggable();
        if (!this.isMobile) {
            this.container?.addEventListener("click", this.onClick);
        }
        window.addEventListener("resize", this.clampToViewport);
        this.client.addEventListener("attackQueueChange", () => this.render());
        this.client.addEventListener("gmcp.objects.nums", () => this.render());
        this.client.addEventListener("gmcp.objects.data", () => this.render());
        this.client.addEventListener("gmcp.char.state", () => this.render());
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
        if (target?.closest(".object-num, .object-desc, .objects-list-controls")) {
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
            const num = numEl.getAttribute("data-object-num");
            if (num) {
                this.client.sendCommand(`/z ${num}`);
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
        const descWidth = Math.max(0, ...objects.map((o: any) => (o.desc || "").length));
        const tm = this.client.TeamManager;
        const nextQueuedId = tm?.getEnemyQueue?.()?.[0];
        const nextQueuedIdString = typeof nextQueuedId === "undefined" ? undefined : String(nextQueuedId);
        const teamAttacking = objects.some((o: any) => {
            return tm?.isInTeam?.(o.desc) && o.attack_num !== false && o.attack_num !== undefined;
        });
        const inCombat = objects.some(
            (o: any) => o.attack_num !== false && o.attack_num !== undefined
        );

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
                nextQueuedIdString !== undefined &&
                typeof obj.num !== "undefined" &&
                nextQueuedIdString === String(obj.num);
            const numClasses = ["object-num"];
            if (isNextQueued) {
                numClasses.push("object-num-next-target");
            }
            const numStyle = isNextQueued ? " style=\"color:#ffd700\"" : "";
            const numLabel = isPlayer
                ? `${prefix}${num}`
                : `${prefix}<span class="${numClasses.join(" ")}" data-object-id="${obj.num}" data-object-num="${num}"${numStyle}>${num}</span>`;
            const rawDesc = obj.desc || "";
            let coloredDesc = rawDesc;
            if (!isPlayer) {
                if (obj.avatar_target) {
                    coloredDesc = `<span style="color:#ffaaaa">${rawDesc}</span>`;
                } else if (tm?.isInTeam?.(rawDesc)) {
                    const isAttacking = obj.attack_num !== false && obj.attack_num !== undefined;
                    let style = "color:springgreen";
                    const classes = [] as string[];
                    if (teamAttacking && !isAttacking) {
                        classes.push("team-not-attacking");
                    }
                    const classAttr = classes.length ? ` class="${classes.join(" ")}"` : "";
                    coloredDesc = `<span${classAttr} style="${style}">${rawDesc}</span>`;
                } else if (
                    typeof obj.state === "number" &&
                    obj.attack_num !== false &&
                    obj.attack_num !== undefined
                ) {
                    coloredDesc = `<span style="color:#b19cd9">${rawDesc}</span>`;
                }
            }
            const padding = " ".repeat(Math.max(0, descWidth - rawDesc.length));
            const isTeammate = tm?.isInTeam?.(rawDesc) ? "true" : "false";
            const desc = isPlayer
                ? `${rawDesc}${padding}`
                : `<span class="object-desc" data-object-id="${obj.num}" data-object-num="${num}" data-object-desc="${rawDesc}" data-teammate="${isTeammate}">${coloredDesc}</span>${padding}`;
            let bar = "";
            if (typeof obj.state === "number") {
                const hp = Math.max(0, Math.min(6, obj.state)) + 1;
                const colorLevel = getColorLevel(hp, 7, false, true);
                const color = COLOR_OBJECT[colorLevel];
                const filled = "#".repeat(hp);
                const empty = "-".repeat(7 - hp);
                bar = `[<span style="color:${color}">${filled}${empty}</span>]`;
            }
            const attackers = objects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => o.shortcut);
            const arrow = attackers.length ? ` <- ${attackers.join(" ")}` : "";
            return `${numLabel} ${bar} ${desc}${arrow}`.trimEnd();
        });
        const html = lines.join("<br>");
        this.content.innerHTML = html;
        if (this.pipContent) {
            this.pipContent.innerHTML = html;
            this.syncPictureInPictureStyles();
        }
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
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("aria-label", "Otwórz listę obiektów w trybie Picture-in-Picture");
        button.title = "Picture-in-Picture";
        button.innerHTML = `<span aria-hidden="true">⤢</span>`;
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
            this.pipContent.innerHTML = this.content.innerHTML;
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
        this.pipButton.setAttribute("aria-pressed", active ? "true" : "false");
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
body {
    margin: 0;
}
#objects-list-pip {
    white-space: pre;
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
}
