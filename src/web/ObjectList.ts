import Client from "@client/Client";
import {globalStorage} from "@modules/core/storage";
import {getBehaviorSettings, onBehaviorSettingsChange} from "@modules/core/settings";
import {createAttackController} from "@client/utils/attackController";
import {hideContextMenu, showContextMenu} from "@web/contextMenu";
import eventBus from "@modules/core/eventBus";
import {getBuiltInPanelSetting, loadLayoutState} from "./layout/utils/layoutStorage";
import {getObjectListChrome} from "./layout/builtInChrome";
import {buildRenderContext, type ObjectListViewMode} from "./objectList/context.ts";
import {getStrategy, renderListLines} from "./objectList/strategies.ts";

const DEFAULT_CONTEXT_MENU_COMMANDS = ['ob', 'ocen', 'zapros', 'wskaz'];

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
    private pipStyleObserver: MutationObserver | null = null;
    private pipTitleObserver: MutationObserver | null = null;
    private locationObserver: MutationObserver | null = null;
    private coverTimerObserver: MutationObserver | null = null;
    private pipLocationText = "";
    private pipCoverTimerText = "";
    private pipLastOutputHtml = "";
    private attackController: ReturnType<typeof createAttackController>;
    private contextMenuCommands: string[] = DEFAULT_CONTEXT_MENU_COMMANDS;
    private viewMode: ObjectListViewMode = 'list';
    private isLayoutManagerEnabled = false;
    private renderScheduled = false;

    constructor(client: Client) {
        this.client = client;
        this.container = document.getElementById("objects-list");
        this.content = this.setupContainer();
        this.isMobile = this.isMobileBrowser();
        this.attackController = createAttackController(client);
        this.setupDraggable();
        if (!this.isMobile) {
            this.container?.addEventListener("click", this.onClick);
            this.container?.addEventListener("contextmenu", this.onContextMenu);
            // Also attach to content for better event capture in docked panels
            this.content?.addEventListener("click", this.onClick);
            this.content?.addEventListener("contextmenu", this.onContextMenu);
            // Use capture phase at document level for card view contextmenu
            document.addEventListener("contextmenu", this.onDocumentContextMenu, true);
        }
        window.addEventListener("resize", this.clampToViewport);
        this.client.on("attackQueueChange", () => this.scheduleRender());
        this.client.on("gmcp.objects.nums", () => this.scheduleRender());
        this.client.on("gmcp.objects.data", () => this.scheduleRender());
        this.client.on("gmcp.char.state", () => this.scheduleRender());
        this.client.on("enemy.paralyzed", () => this.scheduleRender());
        this.client.on("enemy.paralyzed.end", () => this.scheduleRender());
        this.client.on("enemy.broken_defense", () => this.scheduleRender());
        this.client.on("output-sent", () => this.handleOutputUpdate());
        this.client.on("buffer-sent", () => this.handleOutputUpdate());
        this.initializePipInfoSources();
        this.loadContextMenuCommands();
        this.initializeCardViewMode();
        // The PiP toggle lives in the panel header now (ObjectListHeaderActions);
        // it drives the window through this event and reflects the open/closed
        // state via `objectList.pipActiveChanged`.
        eventBus.on('objectList.togglePip', () => { void this.togglePictureInPicture(); });
        eventBus.on('layoutManagerStateChanged', this.handleLayoutManagerStateChange);
        onBehaviorSettingsChange(() => {
            this.loadContextMenuCommands();
            this.scheduleRender();
        });
        // Stock chrome (object-list background/font) still lives in uiSettings;
        // re-render when it changes.
        globalStorage.onChange('uiSettings', () => {
            this.scheduleRender();
        });
        this.render();
    }

    private initializeCardViewMode() {
        const layoutState = loadLayoutState();
        this.isLayoutManagerEnabled = layoutState.enabled;
        this.syncViewModeWithLayoutState(this.isLayoutManagerEnabled);
        // Subscribe to view mode changes from the header toggle
        eventBus.on('objectListViewMode', (mode: ObjectListViewMode) => {
            if (!this.isLayoutManagerEnabled) {
                return;
            }
            if (this.viewMode !== mode) {
                this.viewMode = mode;
                this.render();
            }
        });
    }

    private handleLayoutManagerStateChange = () => {
        const layoutState = loadLayoutState();
        const isEnabled = layoutState.enabled;
        if (isEnabled === this.isLayoutManagerEnabled) {
            return;
        }
        this.isLayoutManagerEnabled = isEnabled;
        this.syncViewModeWithLayoutState(isEnabled);
    };

    private syncViewModeWithLayoutState(isLayoutEnabled: boolean) {
        const defaultViewMode = getObjectListChrome().defaultViewMode ?? 'list';
        const nextViewMode = isLayoutEnabled
            ? getBuiltInPanelSetting<ObjectListViewMode>('objectList', 'viewMode', defaultViewMode)
            : 'list';
        if (this.viewMode !== nextViewMode) {
            this.viewMode = nextViewMode;
            this.render();
        }
    }

    private loadContextMenuCommands() {
        const commands = getBehaviorSettings().objectContextMenuCommands;
        if (Array.isArray(commands) && commands.length > 0) {
            this.contextMenuCommands = commands.filter((c: unknown) => typeof c === 'string');
        } else {
            this.contextMenuCommands = DEFAULT_CONTEXT_MENU_COMMANDS;
        }
    }

    private setupContainer() {
        if (!this.container) return null;
        this.container.innerHTML = "";
        const content = document.createElement("div");
        content.className = "objects-list-content";
        this.container.appendChild(content);
        return content;
    }

    private setupDraggable() {
        if (!this.container) return;

        const saved = globalStorage.get("objectsListPosition");
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

        // In card view, don't interfere with clicks on card elements (allows context menu)
        if (isMousePointer && (this.viewMode === 'card' || this.viewMode === 'compact' || this.viewMode === 'compact-dots' || this.viewMode === 'raid') && target?.closest(".object-card")) {
            return;
        }

        if (
            isMousePointer &&
            target?.closest(".object-num, .object-desc, .objects-list-controls, .target-dot, .object-hp-bar, .object-hp-bar-teammate, .object-card__icon, .object-card__hp-bar, .object-card__hp-bar--teammate, .object-card__hp-bar-vertical, .object-card__hp-bar-vertical--teammate, .object-card__hp-dots, .object-card__hp-dots--teammate, .object-card__number, .object-card__name, .obj")
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
        globalStorage.set("objectsListPosition", position);
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
        // Close any open context menu since stopPropagation prevents document-level handler
        hideContextMenu();
        e.stopPropagation?.();
        // Handle attack target dot click (leader only, /wa to mark, /ra to order attack if active)
        const attackDotEl = target.closest(
            ".target-dot-attack[data-object-num]"
        ) as HTMLElement | null;
        if (attackDotEl) {
            const num = attackDotEl.getAttribute("data-object-num");
            if (num) {
                this.client.sendCommand(`/wa ${num}`);
                if (attackDotEl.classList.contains("target-dot-active")) {
                    this.client.sendCommand(`/ra ${num}`);
                }
            }
            this.focusInput();
            return;
        }
        // Handle defense target dot click (leader only, /wz to mark, /rz to order shield if active)
        const defenseDotEl = target.closest(
            ".target-dot-defense[data-object-num]"
        ) as HTMLElement | null;
        if (defenseDotEl) {
            const num = defenseDotEl.getAttribute("data-object-num");
            if (num) {
                this.client.sendCommand(`/wz ${num}`);
                if (defenseDotEl.classList.contains("target-dot-active")) {
                    this.client.sendCommand(`/rz ${num}`);
                }
            }
            this.focusInput();
            return;
        }
        // Handle HP bar click - send /prze command (list view)
        const hpBarEl = target.closest(
            ".object-hp-bar[data-object-num]"
        ) as HTMLElement | null;
        if (hpBarEl) {
            const num = hpBarEl.getAttribute("data-object-num");
            if (num) {
                this.client.sendCommand(`/prze ${num}`);
            }
            this.focusInput();
            return;
        }
        // Handle teammate HP bar click - send /w command (list view)
        const teammateHpBarEl = target.closest(
            ".object-hp-bar-teammate[data-object-num]"
        ) as HTMLElement | null;
        if (teammateHpBarEl) {
            const num = teammateHpBarEl.getAttribute("data-object-num");
            if (num) {
                this.client.sendCommand(`/w ${num}`);
            }
            this.focusInput();
            return;
        }
        // Handle card view HP bar click - send /prze or /w command (horizontal, vertical, and dots)
        const cardHpBarEl = target.closest(
            ".object-card__hp-bar[data-object-num], .object-card__hp-bar--teammate[data-object-num], .object-card__hp-bar-vertical[data-object-num], .object-card__hp-bar-vertical--teammate[data-object-num], .object-card__hp-dots[data-object-num], .object-card__hp-dots--teammate[data-object-num]"
        ) as HTMLElement | null;
        if (cardHpBarEl) {
            const num = cardHpBarEl.getAttribute("data-object-num");
            if (num) {
                const isTeammateBar = cardHpBarEl.classList.contains("object-card__hp-bar--teammate")
                    || cardHpBarEl.classList.contains("object-card__hp-bar-vertical--teammate")
                    || cardHpBarEl.classList.contains("object-card__hp-dots--teammate");
                this.client.sendCommand(isTeammateBar ? `/w ${num}` : `/prze ${num}`);
            }
            this.focusInput();
            return;
        }
        // Handle card view icon clicks
        const cardIconEl = target.closest(
            ".object-card__icon[data-action]"
        ) as HTMLElement | null;
        if (cardIconEl) {
            const action = cardIconEl.getAttribute("data-action");
            const num = cardIconEl.getAttribute("data-object-num");
            const id = cardIconEl.getAttribute("data-object-id");
            if (action && num) {
                switch (action) {
                    case 'attack':
                        if (id) {
                            this.attackController.attackById(parseInt(id, 10));
                        } else {
                            this.client.sendCommand(`/z ${num}`);
                        }
                        break;
                    case 'guard':
                        this.client.sendCommand(`/za ${num}`);
                        break;
                    case 'przelam':
                        this.client.sendCommand(`/prze ${num}`);
                        break;
                    case 'mark-attack':
                        this.client.sendCommand(`/wa ${num}`);
                        break;
                    case 'mark-defense':
                        this.client.sendCommand(`/wz ${num}`);
                        break;
                }
            }
            this.focusInput();
            return;
        }
        // Handle card view number click (attack)
        const cardNumberEl = target.closest(
            ".object-card__number[data-object-num]"
        ) as HTMLElement | null;
        if (cardNumberEl) {
            const id = cardNumberEl.getAttribute("data-object-id");
            const num = cardNumberEl.getAttribute("data-object-num");
            if (id) {
                // Check if target is a teammate before attacking
                const manager = this.client.ObjectManager;
                const objects = manager?.getObjectsOnLocation() || [];
                const targetObj = objects.find((o: any) => String(o.num) === id);
                const isTeammate = targetObj && this.client.TeamManager?.isInTeam?.(targetObj.desc);

                if (isTeammate) {
                    // Don't attack teammates
                    return;
                }
                this.attackController.attackById(parseInt(id, 10));
            } else if (num) {
                this.client.sendCommand(`/z ${num}`);
            }
            this.focusInput();
            return;
        }
        // Handle card view name click (guard)
        const cardNameEl = target.closest(
            ".object-card__name[data-object-num]"
        ) as HTMLElement | null;
        if (cardNameEl) {
            const num = cardNameEl.getAttribute("data-object-num");
            if (num) {
                this.client.sendCommand(`/za ${num}`);
            }
            this.focusInput();
            return;
        }
        // Nearby ("W poblizu") view: key attacks (enemy), name guards, HP
        // breaks (enemy) / pulls back (teammate). Same commands as the other
        // flavors, just carried on the .obj__* elements.
        const nearbyKeyEl = target.closest(
            ".obj__key.is-clickable[data-object-id]"
        ) as HTMLElement | null;
        if (nearbyKeyEl) {
            const id = nearbyKeyEl.getAttribute("data-object-id");
            if (id) {
                this.attackController.attackById(parseInt(id, 10));
            }
            this.focusInput();
            return;
        }
        const nearbyNameEl = target.closest(
            ".obj__name.is-clickable[data-object-num]"
        ) as HTMLElement | null;
        if (nearbyNameEl) {
            const num = nearbyNameEl.getAttribute("data-object-num");
            if (num) {
                this.client.sendCommand(`/za ${num}`);
            }
            this.focusInput();
            return;
        }
        const nearbyHpEl = target.closest(
            ".obj__hp.is-clickable[data-object-num]"
        ) as HTMLElement | null;
        if (nearbyHpEl) {
            const num = nearbyHpEl.getAttribute("data-object-num");
            const isTeammate = nearbyHpEl.getAttribute("data-teammate") === "true";
            if (num) {
                this.client.sendCommand(isTeammate ? `/w ${num}` : `/prze ${num}`);
            }
            this.focusInput();
            return;
        }
        const numEl = target.closest(
            ".object-num[data-object-num]"
        ) as HTMLElement | null;
        if (numEl) {
            const id = numEl.getAttribute("data-object-id");
            if (id) {
                // Check if target is a teammate before attacking
                const manager = this.client.ObjectManager;
                const objects = manager?.getObjectsOnLocation() || [];
                const targetObj = objects.find((o: any) => String(o.num) === id);
                const isTeammate = targetObj && this.client.TeamManager?.isInTeam?.(targetObj.desc);

                if (isTeammate) {
                    // Don't attack teammates
                    return;
                }
                this.attackController.attackById(parseInt(id, 10));
            } else {
                const num = numEl.getAttribute("data-object-num");
                if (num) {
                    this.client.sendCommand(`/z ${num}`);
                }
            }
            this.focusInput();
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
        this.focusInput();
    };

    private focusInput() {
        (document.getElementById('message-input') as HTMLInputElement | null)?.focus();
    }

    private onContextMenu = (e: MouseEvent) => {
        if (this.isMobile) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;

        let objectId: string | null = null;

        // In card view, find the parent card element
        if (this.viewMode === 'card' || this.viewMode === 'compact' || this.viewMode === 'compact-dots' || this.viewMode === 'raid') {
            const cardEl = target.closest(".object-card") as HTMLElement | null;
            if (cardEl) {
                objectId = cardEl.getAttribute("data-object-id");
            }
        }

        // Fallback to data-object-id attribute (works for list view and card elements with the attribute)
        if (!objectId) {
            const objectEl = target.closest("[data-object-id]") as HTMLElement | null;
            if (objectEl) {
                objectId = objectEl.getAttribute("data-object-id");
            }
        }

        if (!objectId) return;

        if (this.contextMenuCommands.length === 0) return;

        e.preventDefault();

        const items = this.contextMenuCommands.map((command) => ({
            label: command,
            action: () => this.client.sendCommand(`${command} ob_${objectId}`),
        }));

        showContextMenu(items, e.clientX, e.clientY);
    };

    /**
     * Schedules a render using queueMicrotask to ensure all event handlers
     * (including plugins) have finished processing before rendering.
     * This prevents showing stale queue data when multiple events fire rapidly.
     */
    private scheduleRender() {
        if (this.renderScheduled) {
            return;
        }
        this.renderScheduled = true;
        queueMicrotask(() => {
            this.renderScheduled = false;
            this.render();
        });
    }

    private render() {
        if (!this.container || !this.content) return;
        const manager = this.client.ObjectManager;
        if (!manager) return;
        const objects = manager.getObjectsOnLocation();

        // Show placeholder if no objects
        if (objects.length === 0) {
            this.content.innerHTML = '<span style="color: #888; font-style: italic;">Brak obiektow</span>';
            this.rebuildPictureInPictureHtml();
            return;
        }

        const ctx = buildRenderContext(this.client, objects, this.attackController.getAttackCommand());
        const strategy = getStrategy(this.viewMode);
        this.content.innerHTML = strategy.render(ctx);

        // Card-family flavors need the capture-phase context menu on each cards
        // container (raid renders several); other flavors use the delegated
        // onContextMenu via each row's data-object-id.
        if (strategy.cardContextMenu && !this.isMobile) {
            this.content.querySelectorAll('.objects-list-cards').forEach((el) => {
                el.addEventListener('contextmenu', this.onCardContextMenu as EventListener, true);
            });
        }

        this.rebuildPictureInPictureHtml();
    }

    private onCardContextMenu = (e: MouseEvent) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;

        const cardEl = target.closest('.object-card') as HTMLElement | null;
        if (!cardEl) return;

        const objectId = cardEl.getAttribute('data-object-id');
        if (!objectId) return;

        if (this.contextMenuCommands.length === 0) return;

        e.preventDefault();
        e.stopPropagation();

        const items = this.contextMenuCommands.map((command) => ({
            label: command,
            action: () => this.client.sendCommand(`${command} ob_${objectId}`),
        }));

        showContextMenu(items, e.clientX, e.clientY);
    };

    private onDocumentContextMenu = (e: MouseEvent) => {
        // list + nearby use the delegated onContextMenu (row data-object-id);
        // only the card-family flavors need the capture-phase card lookup.
        if (this.viewMode === 'list' || this.viewMode === 'nearby') return;

        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Check if click is inside our container
        if (!this.container?.contains(target) && !this.content?.contains(target)) return;

        const cardEl = target.closest('.object-card') as HTMLElement | null;
        if (!cardEl) return;

        const objectId = cardEl.getAttribute('data-object-id');
        if (!objectId) return;

        if (this.contextMenuCommands.length === 0) return;

        e.preventDefault();
        e.stopPropagation();

        const items = this.contextMenuCommands.map((command) => ({
            label: command,
            action: () => this.client.sendCommand(`${command} ob_${objectId}`),
        }));

        showContextMenu(items, e.clientX, e.clientY);
    };

    private togglePictureInPicture = async (event?: MouseEvent) => {
        event?.preventDefault();
        event?.stopPropagation();
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
                this.pipContent.addEventListener("contextmenu", this.onContextMenu);
            }
            this.injectPictureInPictureStyles();
            this.rebuildPictureInPictureHtml();
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
            this.pipContent.removeEventListener("contextmenu", this.onContextMenu);
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
        // The button lives in the React header; tell it to reflect the state.
        eventBus.emit('objectList.pipActiveChanged', active);
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
#objects-list-pip .object-desc,
#objects-list-pip .object-hp-bar,
#objects-list-pip .object-hp-bar-teammate {
    cursor: pointer;
}
#objects-list-pip .target-dot {
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.15s ease;
}
#objects-list-pip .target-dot:hover {
    opacity: 1;
}
#objects-list-pip .target-dot.target-dot-active {
    opacity: 1;
}
#objects-list-pip .team-not-attacking {
    display: inline-block;
    transform: skewX(-10deg);
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
        if (!this.pipContent) {
            return;
        }
        this.pipContent.innerHTML = this.buildPictureInPictureHtml();
        this.syncPictureInPictureStyles();
    }

    private buildPictureInPictureHtml() {
        // Always render list view for PiP regardless of current viewMode
        const lines = this.buildListViewLinesForPip();
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

    private buildListViewLinesForPip(): string[] {
        const manager = this.client.ObjectManager;
        if (!manager) return [];
        const objects = manager.getObjectsOnLocation();

        if (objects.length === 0) {
            return ['<span style="color: #888; font-style: italic;">Brak obiektow</span>'];
        }

        const ctx = buildRenderContext(this.client, objects, this.attackController.getAttackCommand());
        return renderListLines(ctx);
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
