import Client from "@client/Client";
import {globalStorage} from "@modules/core/storage";
import {createAttackController} from "@client/utils/attackController";
import {COLOR_OBJECT, getColorLevel} from "./colors.ts";
import {type EntryContext, objectListFilters} from "./objectListFilters.ts";
import {hideContextMenu, showContextMenu} from "@web/contextMenu";
import eventBus from "@modules/core/eventBus";
import {getBuiltInPanelSetting, loadLayoutState} from "./layout/utils/layoutStorage";

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
    private pipButton: HTMLButtonElement | null = null;
    private pipStyleObserver: MutationObserver | null = null;
    private pipTitleObserver: MutationObserver | null = null;
    private locationObserver: MutationObserver | null = null;
    private coverTimerObserver: MutationObserver | null = null;
    private pipLocationText = "";
    private pipCoverTimerText = "";
    private pipLastOutputHtml = "";
    private attackController: ReturnType<typeof createAttackController>;
    private contextMenuCommands: string[] = DEFAULT_CONTEXT_MENU_COMMANDS;
    private viewMode: 'list' | 'card' | 'compact' | 'compact-dots' | 'raid' = 'list';
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
        eventBus.on('layoutManagerStateChanged', this.handleLayoutManagerStateChange);
        globalStorage.onChange('uiSettings', () => {
            this.loadContextMenuCommands();
            this.scheduleRender();
        });
        this.render();
    }

    private initializeCardViewMode() {
        const layoutState = loadLayoutState();
        this.isLayoutManagerEnabled = layoutState.enabled;
        this.syncViewModeWithLayoutState(this.isLayoutManagerEnabled);
        // Subscribe to view mode changes from the header toggle
        eventBus.on('objectListViewMode', (mode: 'list' | 'card' | 'compact' | 'compact-dots' | 'raid') => {
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
        const nextViewMode = isLayoutEnabled
            ? getBuiltInPanelSetting<'list' | 'card' | 'compact' | 'compact-dots' | 'raid'>('objectList', 'viewMode', 'list')
            : 'list';
        if (this.viewMode !== nextViewMode) {
            this.viewMode = nextViewMode;
            this.render();
        }
    }

    private loadContextMenuCommands() {
        const uiSettings = globalStorage.get("uiSettings");
        const commands = (uiSettings as any)?.objectContextMenuCommands;
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
        this.setupPictureInPictureControls(content);
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
            target?.closest(".object-num, .object-desc, .objects-list-controls, .target-dot, .object-hp-bar, .object-hp-bar-teammate, .object-card__icon, .object-card__hp-bar, .object-card__hp-bar--teammate, .object-card__hp-bar-vertical, .object-card__hp-bar-vertical--teammate, .object-card__hp-dots, .object-card__hp-dots--teammate, .object-card__number, .object-card__name")
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

        // Render card view, compact view, or list view based on mode
        if (this.viewMode === 'card') {
            this.renderCardView(objects);
            return;
        }
        if (this.viewMode === 'compact') {
            this.renderCompactCardView(objects);
            return;
        }
        if (this.viewMode === 'compact-dots') {
            this.renderCompactDotsView(objects);
            return;
        }
        if (this.viewMode === 'raid') {
            this.renderRaidView(objects);
            return;
        }
        const descWidth = Math.max(0, ...objects.map((o: any) => (o.desc || "").length));
        const tm = this.client.TeamManager;
        const fullQueue = tm?.getEnemyQueue?.() ?? [];
        const nextQueuedId = fullQueue[0];

        // Verify the queued enemy actually exists in the current object list
        const queuedEnemyExists = nextQueuedId !== undefined &&
            objects.some((o: any) => typeof o.num !== "undefined" && o.num === nextQueuedId);
        const validNextQueuedId = queuedEnemyExists ? nextQueuedId : undefined;

        const teamAttacking = objects.some((o: any) => {
            return tm?.isInTeam?.(o.desc) && o.attack_num !== false && o.attack_num !== undefined;
        });

        const lines = objects.map((obj: any) => {
            const num = String(obj.shortcut);
            const isPlayer = obj.shortcut === '@';
            // Target indicators
            let prefix = "  ";
            const isLeader = tm?.isLeader?.();
            const isTeammateForDot = tm?.isInTeam?.(obj.desc || "");

            if (isLeader) {
                // Leader sees clickable indicators
                if (isPlayer || isTeammateForDot) {
                    // Self or teammate - defense target (greenyellow), command /wz
                    if (obj.defense_target) {
                        // Active - show >> that can be clicked to remove
                        prefix = `<span class="target-dot target-dot-defense target-dot-active" data-object-num="${num}" data-object-id="${obj.num}" style="color:greenyellow" title="Rozkazanie obrony celu">>></span>`;
                    } else {
                        // Not active - show dot that can be clicked to set
                        prefix = `<span class="target-dot target-dot-defense" data-object-num="${num}" data-object-id="${obj.num}" style="color:greenyellow" title="Wyznacz cel obrony">&#8226; </span>`;
                    }
                } else {
                    // Enemy - attack target (orangered), command /wa
                    if (obj.attack_target) {
                        // Active - show >> that can be clicked to remove
                        prefix = `<span class="target-dot target-dot-attack target-dot-active" data-object-num="${num}" data-object-id="${obj.num}" style="color:orangered" title="Rozkazanie ataku celu">>></span>`;
                    } else {
                        // Not active - show dot that can be clicked to set
                        prefix = `<span class="target-dot target-dot-attack" data-object-num="${num}" data-object-id="${obj.num}" style="color:orangered" title="Wyznacz cel ataku">&#8226; </span>`;
                    }
                }
            } else {
                // Non-leaders see >> when target is set (not clickable)
                if (obj.attack_target) {
                    prefix = `<span style="color:orangered">>></span>`;
                } else if (obj.defense_target) {
                    prefix = `<span style="color:greenyellow">>></span>`;
                }
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
                : `${prefix}<span class="${numClasses.join(" ")}" data-object-id="${obj.num}" data-object-num="${num}"${numStyle} title="Zaatakuj">${num}</span>`;
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
                attackCommand: this.attackController.getAttackCommand()
            };
            const filterResult = objectListFilters.apply(filterContext);

            // Use filtered number label if provided
            if (filterResult.content?.numberLabel !== undefined) {
                numLabel = filterResult.content.numberLabel;
            }

            // Build description with filter overrides
            let descriptionColor: string | undefined;
            const descClasses = [] as string[];

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
            if (!isPlayer && (descriptionColor || filterResult.style?.descriptionBackgroundColor)) {
                const classAttr = descClasses.length ? ` class="${descClasses.join(" ")}"` : "";
                let style = "";
                if (descriptionColor) {
                    style += `color:${descriptionColor};`;
                }
                if (filterResult.style?.descriptionBackgroundColor) {
                    style += `background-color:${filterResult.style.descriptionBackgroundColor};`;
                }
                coloredDesc = `<span${classAttr} style="${style}">${displayDesc}</span>`;
            }

            const padding = " ".repeat(Math.max(0, descWidth - rawDesc.length));
            const isTeammateStr = isTeammate ? "true" : "false";
            const desc = isPlayer
                ? `${displayDesc}${padding}`
                : `<span class="object-desc" data-object-id="${obj.num}" data-object-num="${num}" data-object-desc="${rawDesc}" data-teammate="${isTeammateStr}" title="Zaslon">${coloredDesc}</span>${padding}`;

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
                const hpBarContent = `[<span style="color:${color}">${filled}${empty}</span>]`;
                // Make HP bar clickable for enemies and teammates (not player)
                if (!isPlayer && !isTeammate) {
                    bar = `<span class="object-hp-bar" data-object-num="${num}" data-object-id="${obj.num}" title="Przelam">${hpBarContent}</span>`;
                } else if (isTeammate) {
                    bar = `<span class="object-hp-bar-teammate" data-object-num="${num}" data-object-id="${obj.num}" title="Wycofaj sie">${hpBarContent}</span>`;
                } else {
                    bar = hpBarContent;
                }
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
        this.content.innerHTML = lines.join("<br>");
        this.rebuildPictureInPictureHtml();
    }

    private renderCardView(objects: any[]) {
        if (!this.content) return;

        const tm = this.client.TeamManager;
        const nextQueuedId = tm?.getEnemyQueue?.()?.[0];

        // Verify the queued enemy actually exists in the current object list
        const queuedEnemyExists = nextQueuedId !== undefined &&
            objects.some((o: any) => typeof o.num !== "undefined" && o.num === nextQueuedId);
        const validNextQueuedId = queuedEnemyExists ? nextQueuedId : undefined;

        // Check if any teammate is attacking (for italic styling of non-attacking teammates)
        const teamAttacking = objects.some((o: any) => {
            return tm?.isInTeam?.(o.desc) && o.attack_num !== false && o.attack_num !== undefined;
        });

        const cards = objects.map((obj: any) => {
            const num = String(obj.shortcut);
            const isPlayer = obj.shortcut === '@';
            const rawDesc = obj.desc || "";
            const isTeammate = tm?.isInTeam?.(rawDesc);
            const isAttacking = obj.attack_num !== false && obj.attack_num !== undefined;
            const isNextQueued =
                !isPlayer &&
                validNextQueuedId !== undefined &&
                typeof obj.num !== "undefined" &&
                validNextQueuedId === obj.num;
            const isTarget = obj.avatar_target || false;

            // Apply filters before rendering
            const filterContext: EntryContext = {
                object: obj,
                displayNum: parseInt(num, 10),
                isTarget,
                isNextTarget: isNextQueued,
                isTeammate: isTeammate || false,
                rawDescription: rawDesc,
                isAttacking,
                attackCommand: this.attackController.getAttackCommand()
            };
            const filterResult = objectListFilters.apply(filterContext);

            // Card classes
            const cardClasses = ['object-card'];
            if (isPlayer) cardClasses.push('object-card--player');
            if (isTeammate && !isPlayer) cardClasses.push('object-card--teammate');
            if (isTarget && !isPlayer) cardClasses.push('object-card--target');
            if (isNextQueued) cardClasses.push('object-card--next-queued');
            if (obj.attack_target) cardClasses.push('object-card--attack-target');
            if (obj.defense_target) cardClasses.push('object-card--defense-target');

            // Apply filter CSS classes to card
            if (filterResult.style?.cssClasses) {
                cardClasses.push(...filterResult.style.cssClasses);
            }

            // Number badge classes
            const numberClasses = ['object-card__number'];
            if (isNextQueued) numberClasses.push('object-card__number--next-target');

            // Name classes
            const nameClasses = ['object-card__name'];
            if (isTarget && !isPlayer && !isTeammate) nameClasses.push('object-card__name--target');
            if (isTeammate && !isPlayer) nameClasses.push('object-card__name--teammate');
            if (isAttacking && !isPlayer && !isTeammate && !isTarget) nameClasses.push('object-card__name--attacking');

            // Apply teammate not attacking italic style
            if (isTeammate && !isPlayer && teamAttacking && !isAttacking) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }

            // Apply filter italic override
            if (filterResult.style?.italic) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }

            // Build name style from filter overrides
            let nameStyle = '';
            if (filterResult.style?.descriptionColor) {
                nameStyle += `color:${filterResult.style.descriptionColor};`;
            }
            if (filterResult.style?.descriptionBackgroundColor) {
                nameStyle += `background-color:${filterResult.style.descriptionBackgroundColor};`;
            }

            // Use filtered description if provided
            const displayDesc = filterResult.content?.description !== undefined
                ? filterResult.content.description
                : rawDesc;

            // Apply prefix and suffix from filters
            const customPrefix = filterResult.style?.prefix || "";
            const customSuffix = filterResult.style?.suffix || "";
            const finalDesc = `${customPrefix}${displayDesc}${customSuffix}`;

            // Build HP bar with color based on health level (0-6 scale, 7 levels)
            let hpBarFill = '';
            if (filterResult.content?.hpBar !== undefined) {
                // Use custom HP bar from filter (raw HTML)
                hpBarFill = filterResult.content.hpBar;
            } else if (typeof obj.hp === 'number') {
                const hpLevel = Math.max(0, Math.min(6, obj.hp)) + 1; // 1-7 for CSS classes
                const hpPercent = (hpLevel / 7) * 100;
                // Color mapping: 1-2=dark red, 3=red, 4=orange, 5=yellow, 6=lime, 7=green
                const hpColors: Record<number, string> = {
                    1: '#dc2626',
                    2: '#dc2626',
                    3: '#ef4444',
                    4: '#f97316',
                    5: '#eab308',
                    6: '#84cc16',
                    7: '#22c55e'
                };
                let hpColor = hpColors[hpLevel] || '#22c55e';

                // Apply filter HP bar color override
                if (filterResult.style?.hpBarColor) {
                    hpColor = filterResult.style.hpBarColor;
                }

                hpBarFill = `<div class="object-card__hp-fill" style="width: ${hpPercent}%; background-color: ${hpColor}"></div>`;
            }

            // Build action icons (only for non-player, non-teammate)
            const isLeader = tm?.isLeader?.();
            let iconsHtml = '';
            if (!isPlayer && !isTeammate) {
                const markAttackClass = obj.attack_target ? 'object-card__icon--mark-attack--active' : '';
                const markAttackIcon = isLeader ? `<span class="object-card__icon object-card__icon--mark-attack ${markAttackClass}" data-action="mark-attack" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel ataku"></span>` : '';
                iconsHtml = `
                    <span class="object-card__icon object-card__icon--attack" data-action="attack" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj"></span>
                    <span class="object-card__icon object-card__icon--guard" data-action="guard" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"></span>
                    <span class="object-card__icon object-card__icon--przelam" data-action="przelam" data-object-num="${num}" data-object-id="${obj.num}" title="Przelam"></span>
                    ${markAttackIcon}
                `;
            } else if (isTeammate && !isPlayer) {
                const markDefenseClass = obj.defense_target ? 'object-card__icon--mark-defense--active' : '';
                const markDefenseIcon = isLeader ? `<span class="object-card__icon object-card__icon--mark-defense ${markDefenseClass}" data-action="mark-defense" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel obrony"></span>` : '';
                iconsHtml = `
                    <span class="object-card__icon object-card__icon--guard" data-action="guard" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"></span>
                    ${markDefenseIcon}
                `;
            }

            // Build attackers
            const attackers = objects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => `<span class="object-card__attacker">${o.shortcut}</span>`)
                .join('');

            // Build name element with optional style
            const nameStyleAttr = nameStyle ? ` style="${nameStyle}"` : '';

            // Simplified card structure - single container, no absolute positioning
            return `<div class="${cardClasses.join(' ')}" data-object-id="${obj.num}" data-object-num="${num}">
                <div class="object-card__row1">
                    <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj">${num}</span>
                    <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"${nameStyleAttr}>${finalDesc}</span>
                    <span class="object-card__icons">${iconsHtml}</span>
                </div>
                <div class="object-card__row2">
                    <span class="object-card__attackers">${attackers}</span>
                </div>
                <div class="${isTeammate && !isPlayer ? 'object-card__hp-bar--teammate' : 'object-card__hp-bar'}" data-object-num="${num}" data-object-id="${obj.num}" title="${isTeammate && !isPlayer ? 'Wycofaj sie' : 'Przelam'}">${hpBarFill}</div>
            </div>`;
        });

        this.content.innerHTML = `<div class="objects-list-cards">${cards.join('')}</div>`;

        // Attach contextmenu handler directly to the cards container (use capture phase)
        const cardsContainer = this.content.querySelector('.objects-list-cards');
        if (cardsContainer && !this.isMobile) {
            cardsContainer.addEventListener('contextmenu', this.onCardContextMenu as EventListener, true);
        }

        this.rebuildPictureInPictureHtml();
    }

    private renderCompactCardView(objects: any[]) {
        if (!this.content) return;

        const tm = this.client.TeamManager;
        const nextQueuedId = tm?.getEnemyQueue?.()?.[0];

        // Verify the queued enemy actually exists in the current object list
        const queuedEnemyExists = nextQueuedId !== undefined &&
            objects.some((o: any) => typeof o.num !== "undefined" && o.num === nextQueuedId);
        const validNextQueuedId = queuedEnemyExists ? nextQueuedId : undefined;

        // Check if any teammate is attacking (for italic styling of non-attacking teammates)
        const teamAttacking = objects.some((o: any) => {
            return tm?.isInTeam?.(o.desc) && o.attack_num !== false && o.attack_num !== undefined;
        });

        const cards = objects.map((obj: any) => {
            const num = String(obj.shortcut);
            const isPlayer = obj.shortcut === '@';
            const rawDesc = obj.desc || "";
            const isTeammate = tm?.isInTeam?.(rawDesc);
            const isAttacking = obj.attack_num !== false && obj.attack_num !== undefined;
            const isNextQueued =
                !isPlayer &&
                validNextQueuedId !== undefined &&
                typeof obj.num !== "undefined" &&
                validNextQueuedId === obj.num;
            const isTarget = obj.avatar_target || false;

            // Apply filters before rendering
            const filterContext: EntryContext = {
                object: obj,
                displayNum: parseInt(num, 10),
                isTarget,
                isNextTarget: isNextQueued,
                isTeammate: isTeammate || false,
                rawDescription: rawDesc,
                isAttacking,
                attackCommand: this.attackController.getAttackCommand()
            };
            const filterResult = objectListFilters.apply(filterContext);

            // Card classes
            const cardClasses = ['object-card', 'object-card--compact'];
            if (isPlayer) cardClasses.push('object-card--player');
            if (isTeammate && !isPlayer) cardClasses.push('object-card--teammate');
            if (isTarget && !isPlayer) cardClasses.push('object-card--target');
            if (isNextQueued) cardClasses.push('object-card--next-queued');
            if (obj.attack_target) cardClasses.push('object-card--attack-target');
            if (obj.defense_target) cardClasses.push('object-card--defense-target');

            // Apply filter CSS classes to card
            if (filterResult.style?.cssClasses) {
                cardClasses.push(...filterResult.style.cssClasses);
            }

            // Number badge classes
            const numberClasses = ['object-card__number'];
            if (isNextQueued) numberClasses.push('object-card__number--next-target');

            // Name classes
            const nameClasses = ['object-card__name'];
            if (isTarget && !isPlayer && !isTeammate) nameClasses.push('object-card__name--target');
            if (isTeammate && !isPlayer) nameClasses.push('object-card__name--teammate');
            if (isAttacking && !isPlayer && !isTeammate && !isTarget) nameClasses.push('object-card__name--attacking');

            // Apply teammate not attacking italic style
            if (isTeammate && !isPlayer && teamAttacking && !isAttacking) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }

            // Apply filter italic override
            if (filterResult.style?.italic) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }

            // Build name style from filter overrides
            let nameStyle = '';
            if (filterResult.style?.descriptionColor) {
                nameStyle += `color:${filterResult.style.descriptionColor};`;
            }
            if (filterResult.style?.descriptionBackgroundColor) {
                nameStyle += `background-color:${filterResult.style.descriptionBackgroundColor};`;
            }

            // Use filtered description if provided
            const displayDesc = filterResult.content?.description !== undefined
                ? filterResult.content.description
                : rawDesc;

            // Apply prefix and suffix from filters
            const customPrefix = filterResult.style?.prefix || "";
            const customSuffix = filterResult.style?.suffix || "";
            const finalDesc = `${customPrefix}${displayDesc}${customSuffix}`;

            // Build vertical HP bar with color based on health level (0-6 scale, 7 levels)
            let hpBarHtml = '';
            if (typeof obj.hp === 'number') {
                const hpLevel = Math.max(0, Math.min(6, obj.hp)) + 1; // 1-7 for CSS classes
                const hpPercent = (hpLevel / 7) * 100;
                // Color mapping: 1-2=dark red, 3=red, 4=orange, 5=yellow, 6=lime, 7=green
                const hpColors: Record<number, string> = {
                    1: '#dc2626',
                    2: '#dc2626',
                    3: '#ef4444',
                    4: '#f97316',
                    5: '#eab308',
                    6: '#84cc16',
                    7: '#22c55e'
                };
                let hpColor = hpColors[hpLevel] || '#22c55e';

                // Apply filter HP bar color override
                if (filterResult.style?.hpBarColor) {
                    hpColor = filterResult.style.hpBarColor;
                }

                const hpBarVerticalClass = isTeammate && !isPlayer ? 'object-card__hp-bar-vertical--teammate' : 'object-card__hp-bar-vertical';
                const hpBarVerticalTitle = isTeammate && !isPlayer ? 'Wycofaj sie' : 'Przelam';
                hpBarHtml = `<div class="${hpBarVerticalClass}" data-object-num="${num}" data-object-id="${obj.num}" title="${hpBarVerticalTitle}">
                    <div class="object-card__hp-fill-vertical" style="height: ${hpPercent}%; background-color: ${hpColor}"></div>
                </div>`;
            }

            // Build attackers inline with name
            const attackers = objects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => `<span class="object-card__attacker">${o.shortcut}</span>`)
                .join('');
            const attackersHtml = attackers ? `<span class="object-card__attackers-inline">${attackers}</span>` : '';

            // Build name element with optional style
            const nameStyleAttr = nameStyle ? ` style="${nameStyle}"` : '';

            // Build target dot for leader functionality
            const isLeader = tm?.isLeader?.();
            let targetDotHtml = '';
            if (isLeader) {
                if (isPlayer || isTeammate) {
                    // Self or teammate - defense target (greenyellow)
                    const activeClass = obj.defense_target ? 'object-card__target-dot--active' : '';
                    targetDotHtml = `<span class="object-card__target-dot object-card__target-dot--defense ${activeClass}" data-action="mark-defense" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel obrony"></span>`;
                } else {
                    // Enemy - attack target (orangered)
                    const activeClass = obj.attack_target ? 'object-card__target-dot--active' : '';
                    targetDotHtml = `<span class="object-card__target-dot object-card__target-dot--attack ${activeClass}" data-action="mark-attack" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel ataku"></span>`;
                }
            }

            // Compact card structure - HP bar on left, target dot before number
            return `<div class="${cardClasses.join(' ')}" data-object-id="${obj.num}" data-object-num="${num}">
                ${hpBarHtml}
                <div class="object-card__compact-content">
                    ${targetDotHtml}
                    <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj">${num}</span>
                    <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"${nameStyleAttr}>${finalDesc}</span>
                    ${attackersHtml}
                </div>
            </div>`;
        });

        this.content.innerHTML = `<div class="objects-list-cards objects-list-cards--compact">${cards.join('')}</div>`;

        // Attach contextmenu handler directly to the cards container (use capture phase)
        const cardsContainer = this.content.querySelector('.objects-list-cards');
        if (cardsContainer && !this.isMobile) {
            cardsContainer.addEventListener('contextmenu', this.onCardContextMenu as EventListener, true);
        }

        this.rebuildPictureInPictureHtml();
    }

    private renderCompactDotsView(objects: any[]) {
        if (!this.content) return;

        const tm = this.client.TeamManager;
        const nextQueuedId = tm?.getEnemyQueue?.()?.[0];

        // Verify the queued enemy actually exists in the current object list
        const queuedEnemyExists = nextQueuedId !== undefined &&
            objects.some((o: any) => typeof o.num !== "undefined" && o.num === nextQueuedId);
        const validNextQueuedId = queuedEnemyExists ? nextQueuedId : undefined;

        // Check if any teammate is attacking (for italic styling of non-attacking teammates)
        const teamAttacking = objects.some((o: any) => {
            return tm?.isInTeam?.(o.desc) && o.attack_num !== false && o.attack_num !== undefined;
        });

        const cards = objects.map((obj: any) => {
            const num = String(obj.shortcut);
            const isPlayer = obj.shortcut === '@';
            const rawDesc = obj.desc || "";
            const isTeammate = tm?.isInTeam?.(rawDesc);
            const isAttacking = obj.attack_num !== false && obj.attack_num !== undefined;
            const isNextQueued =
                !isPlayer &&
                validNextQueuedId !== undefined &&
                typeof obj.num !== "undefined" &&
                validNextQueuedId === obj.num;
            const isTarget = obj.avatar_target || false;

            // Apply filters before rendering
            const filterContext: EntryContext = {
                object: obj,
                displayNum: parseInt(num, 10),
                isTarget,
                isNextTarget: isNextQueued,
                isTeammate: isTeammate || false,
                rawDescription: rawDesc,
                isAttacking,
                attackCommand: this.attackController.getAttackCommand()
            };
            const filterResult = objectListFilters.apply(filterContext);

            // Card classes
            const cardClasses = ['object-card', 'object-card--compact', 'object-card--compact-dots'];
            if (isPlayer) cardClasses.push('object-card--player');
            if (isTeammate && !isPlayer) cardClasses.push('object-card--teammate');
            if (isTarget && !isPlayer) cardClasses.push('object-card--target');
            if (isNextQueued) cardClasses.push('object-card--next-queued');
            if (obj.attack_target) cardClasses.push('object-card--attack-target');
            if (obj.defense_target) cardClasses.push('object-card--defense-target');

            // Apply filter CSS classes to card
            if (filterResult.style?.cssClasses) {
                cardClasses.push(...filterResult.style.cssClasses);
            }

            // Number badge classes
            const numberClasses = ['object-card__number'];
            if (isNextQueued) numberClasses.push('object-card__number--next-target');

            // Name classes
            const nameClasses = ['object-card__name'];
            if (isTarget && !isPlayer && !isTeammate) nameClasses.push('object-card__name--target');
            if (isTeammate && !isPlayer) nameClasses.push('object-card__name--teammate');
            if (isAttacking && !isPlayer && !isTeammate && !isTarget) nameClasses.push('object-card__name--attacking');

            // Apply teammate not attacking italic style
            if (isTeammate && !isPlayer && teamAttacking && !isAttacking) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }

            // Apply filter italic override
            if (filterResult.style?.italic) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }

            // Build name style from filter overrides
            let nameStyle = '';
            if (filterResult.style?.descriptionColor) {
                nameStyle += `color:${filterResult.style.descriptionColor};`;
            }
            if (filterResult.style?.descriptionBackgroundColor) {
                nameStyle += `background-color:${filterResult.style.descriptionBackgroundColor};`;
            }

            // Use filtered description if provided
            const displayDesc = filterResult.content?.description !== undefined
                ? filterResult.content.description
                : rawDesc;

            // Apply prefix and suffix from filters
            const customPrefix = filterResult.style?.prefix || "";
            const customSuffix = filterResult.style?.suffix || "";
            const finalDesc = `${customPrefix}${displayDesc}${customSuffix}`;

            // Build HP dots with color based on health level (0-6 scale, 7 levels)
            let hpDotsHtml = '';
            if (typeof obj.hp === 'number') {
                const hpLevel = Math.max(0, Math.min(6, obj.hp)) + 1; // 1-7 for CSS classes
                // Color mapping: 1-2=dark red, 3=red, 4=orange, 5=yellow, 6=lime, 7=green
                const hpColors: Record<number, string> = {
                    1: '#dc2626',
                    2: '#dc2626',
                    3: '#ef4444',
                    4: '#f97316',
                    5: '#eab308',
                    6: '#84cc16',
                    7: '#22c55e'
                };
                let hpColor = hpColors[hpLevel] || '#22c55e';

                // Apply filter HP bar color override
                if (filterResult.style?.hpBarColor) {
                    hpColor = filterResult.style.hpBarColor;
                }

                // Build dots - filled dots for current HP, empty smaller gray dots for missing HP
                const dots: string[] = [];
                for (let i = 0; i < 7; i++) {
                    if (i < hpLevel) {
                        dots.push(`<span class="object-card__hp-dot object-card__hp-dot--filled" style="background-color: ${hpColor}"></span>`);
                    } else {
                        dots.push(`<span class="object-card__hp-dot object-card__hp-dot--empty"></span>`);
                    }
                }

                const hpDotsClass = isTeammate && !isPlayer ? 'object-card__hp-dots--teammate' : 'object-card__hp-dots';
                const hpDotsTitle = isTeammate && !isPlayer ? 'Wycofaj sie' : 'Przelam';
                hpDotsHtml = `<div class="${hpDotsClass}" data-object-num="${num}" data-object-id="${obj.num}" title="${hpDotsTitle}">${dots.join('')}</div>`;
            }

            // Build attackers inline with name
            const attackers = objects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => `<span class="object-card__attacker">${o.shortcut}</span>`)
                .join('');
            const attackersHtml = attackers ? `<span class="object-card__attackers-inline">${attackers}</span>` : '';

            // Build name element with optional style
            const nameStyleAttr = nameStyle ? ` style="${nameStyle}"` : '';

            // Build target dot for leader functionality
            const isLeader = tm?.isLeader?.();
            let targetDotHtml = '';
            if (isLeader) {
                if (isPlayer || isTeammate) {
                    // Self or teammate - defense target (greenyellow)
                    const activeClass = obj.defense_target ? 'object-card__target-dot--active' : '';
                    targetDotHtml = `<span class="object-card__target-dot object-card__target-dot--defense ${activeClass}" data-action="mark-defense" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel obrony"></span>`;
                } else {
                    // Enemy - attack target (orangered)
                    const activeClass = obj.attack_target ? 'object-card__target-dot--active' : '';
                    targetDotHtml = `<span class="object-card__target-dot object-card__target-dot--attack ${activeClass}" data-action="mark-attack" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel ataku"></span>`;
                }
            }

            // Compact dots card structure - HP dots instead of vertical bar
            return `<div class="${cardClasses.join(' ')}" data-object-id="${obj.num}" data-object-num="${num}">
                <div class="object-card__compact-content">
                    ${targetDotHtml}
                    <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj">${num}</span>
                    ${hpDotsHtml}
                    <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"${nameStyleAttr}>${finalDesc}</span>
                    ${attackersHtml}
                </div>
            </div>`;
        });

        this.content.innerHTML = `<div class="objects-list-cards objects-list-cards--compact">${cards.join('')}</div>`;

        // Attach contextmenu handler directly to the cards container (use capture phase)
        const cardsContainer = this.content.querySelector('.objects-list-cards');
        if (cardsContainer && !this.isMobile) {
            cardsContainer.addEventListener('contextmenu', this.onCardContextMenu as EventListener, true);
        }

        this.rebuildPictureInPictureHtml();
    }

    private renderRaidView(objects: any[]) {
        if (!this.content) return;

        const tm = this.client.TeamManager;
        const nextQueuedId = tm?.getEnemyQueue?.()?.[0];

        const queuedEnemyExists = nextQueuedId !== undefined &&
            objects.some((o: any) => typeof o.num !== "undefined" && o.num === nextQueuedId);
        const validNextQueuedId = queuedEnemyExists ? nextQueuedId : undefined;

        const teamAttacking = objects.some((o: any) => {
            return tm?.isInTeam?.(o.desc) && o.attack_num !== false && o.attack_num !== undefined;
        });

        const isLeader = tm?.isLeader?.();

        const buildCard = (obj: any): string => {
            const num = String(obj.shortcut);
            const isPlayer = obj.shortcut === '@';
            const rawDesc = obj.desc || "";
            const isTeammate = tm?.isInTeam?.(rawDesc);
            const isAttacking = obj.attack_num !== false && obj.attack_num !== undefined;
            const isNextQueued =
                !isPlayer &&
                validNextQueuedId !== undefined &&
                typeof obj.num !== "undefined" &&
                validNextQueuedId === obj.num;
            const isTarget = obj.avatar_target || false;

            const filterContext: EntryContext = {
                object: obj,
                displayNum: parseInt(num, 10),
                isTarget,
                isNextTarget: isNextQueued,
                isTeammate: isTeammate || false,
                rawDescription: rawDesc,
                isAttacking,
                attackCommand: this.attackController.getAttackCommand()
            };
            const filterResult = objectListFilters.apply(filterContext);

            const cardClasses = ['object-card', 'object-card--raid'];
            if (isPlayer) cardClasses.push('object-card--player');
            if (isTeammate && !isPlayer) cardClasses.push('object-card--teammate');
            if (isTarget && !isPlayer) cardClasses.push('object-card--target');
            if (isNextQueued) cardClasses.push('object-card--next-queued');
            if (obj.attack_target) cardClasses.push('object-card--attack-target');
            if (obj.defense_target) cardClasses.push('object-card--defense-target');
            if (filterResult.style?.cssClasses) {
                cardClasses.push(...filterResult.style.cssClasses);
            }

            const numberClasses = ['object-card__number'];
            if (isNextQueued) numberClasses.push('object-card__number--next-target');

            const nameClasses = ['object-card__name'];
            if (isTarget && !isPlayer && !isTeammate) nameClasses.push('object-card__name--target');
            if (isTeammate && !isPlayer) nameClasses.push('object-card__name--teammate');
            if (isAttacking && !isPlayer && !isTeammate && !isTarget) nameClasses.push('object-card__name--attacking');
            if (isTeammate && !isPlayer && teamAttacking && !isAttacking) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }
            if (filterResult.style?.italic) {
                nameClasses.push('object-card__name--teammate-not-attacking');
            }

            let nameStyle = '';
            if (filterResult.style?.descriptionColor) {
                nameStyle += `color:${filterResult.style.descriptionColor};`;
            }
            if (filterResult.style?.descriptionBackgroundColor) {
                nameStyle += `background-color:${filterResult.style.descriptionBackgroundColor};`;
            }

            const displayDesc = filterResult.content?.description !== undefined
                ? filterResult.content.description
                : rawDesc;
            const customPrefix = filterResult.style?.prefix || "";
            const customSuffix = filterResult.style?.suffix || "";
            const finalDesc = `${customPrefix}${displayDesc}${customSuffix}`;

            let hpBarHtml = '';
            const hpBarClass = isTeammate && !isPlayer ? 'object-card__hp-bar--teammate' : 'object-card__hp-bar';
            const hpBarTitle = isTeammate && !isPlayer ? 'Wycofaj sie' : 'Przelam';
            if (filterResult.content?.hpBar !== undefined) {
                hpBarHtml = `<div class="${hpBarClass} object-card__hp-bar--raid" data-object-num="${num}" data-object-id="${obj.num}" title="${hpBarTitle}">${filterResult.content.hpBar}</div>`;
            } else if (typeof obj.hp === 'number') {
                const hpLevel = Math.max(0, Math.min(6, obj.hp)) + 1;
                const hpPercent = (hpLevel / 7) * 100;
                const hpColors: Record<number, string> = {
                    1: '#dc2626',
                    2: '#dc2626',
                    3: '#ef4444',
                    4: '#f97316',
                    5: '#eab308',
                    6: '#84cc16',
                    7: '#22c55e'
                };
                let hpColor = hpColors[hpLevel] || '#22c55e';
                if (filterResult.style?.hpBarColor) {
                    hpColor = filterResult.style.hpBarColor;
                }
                hpBarHtml = `<div class="${hpBarClass} object-card__hp-bar--raid" data-object-num="${num}" data-object-id="${obj.num}" title="${hpBarTitle}"><div class="object-card__hp-fill" style="width: ${hpPercent}%; background-color: ${hpColor}"></div></div>`;
            } else {
                hpBarHtml = `<div class="${hpBarClass} object-card__hp-bar--raid" data-object-num="${num}" data-object-id="${obj.num}" title="${hpBarTitle}"></div>`;
            }

            let iconsHtml = '';
            if (!isPlayer && !isTeammate) {
                const markAttackClass = obj.attack_target ? 'object-card__icon--mark-attack--active' : '';
                const markAttackIcon = isLeader ? `<span class="object-card__icon object-card__icon--mark-attack ${markAttackClass}" data-action="mark-attack" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel ataku"></span>` : '';
                iconsHtml = `
                    <span class="object-card__icon object-card__icon--attack" data-action="attack" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj"></span>
                    <span class="object-card__icon object-card__icon--guard" data-action="guard" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"></span>
                    <span class="object-card__icon object-card__icon--przelam" data-action="przelam" data-object-num="${num}" data-object-id="${obj.num}" title="Przelam"></span>
                    ${markAttackIcon}
                `;
            } else if (isTeammate && !isPlayer) {
                const markDefenseClass = obj.defense_target ? 'object-card__icon--mark-defense--active' : '';
                const markDefenseIcon = isLeader ? `<span class="object-card__icon object-card__icon--mark-defense ${markDefenseClass}" data-action="mark-defense" data-object-num="${num}" data-object-id="${obj.num}" title="Wyznacz cel obrony"></span>` : '';
                iconsHtml = `
                    <span class="object-card__icon object-card__icon--guard" data-action="guard" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"></span>
                    ${markDefenseIcon}
                `;
            }

            const attackers = objects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => `<span class="object-card__attacker">${o.shortcut}</span>`)
                .join('');
            const attackersHtml = attackers
                ? `<span class="object-card__attackers-inline">${attackers}</span>`
                : '';

            const nameStyleAttr = nameStyle ? ` style="${nameStyle}"` : '';

            return `<div class="${cardClasses.join(' ')}" data-object-id="${obj.num}" data-object-num="${num}">
                ${hpBarHtml}
                <div class="object-card__raid-content">
                    <div class="object-card__raid-row object-card__raid-row--main">
                        <span class="${numberClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaatakuj">${num}</span>
                        <span class="${nameClasses.join(' ')}" data-object-num="${num}" data-object-id="${obj.num}" title="Zaslon"${nameStyleAttr}>${finalDesc}</span>
                    </div>
                    <div class="object-card__raid-row object-card__raid-row--attackers">
                        ${attackersHtml}
                    </div>
                </div>
                <span class="object-card__icons object-card__icons--raid">${iconsHtml}</span>
            </div>`;
        };

        // Split team (player + teammates) from enemies; player first within team section
        const teamObjects: any[] = [];
        const enemyObjects: any[] = [];
        for (const obj of objects) {
            const isPlayer = obj.shortcut === '@';
            const isTeammate = tm?.isInTeam?.(obj.desc || "");
            if (isPlayer || isTeammate) {
                teamObjects.push(obj);
            } else {
                enemyObjects.push(obj);
            }
        }
        teamObjects.sort((a: any, b: any) => {
            if (a.shortcut === '@') return -1;
            if (b.shortcut === '@') return 1;
            return 0;
        });

        const sections: string[] = [];
        if (teamObjects.length > 0) {
            sections.push(
                `<div class="objects-list-cards objects-list-cards--raid objects-list-cards--raid-team">${teamObjects.map(buildCard).join('')}</div>`
            );
        }
        if (enemyObjects.length > 0) {
            sections.push(
                `<div class="objects-list-cards objects-list-cards--raid objects-list-cards--raid-enemies">${enemyObjects.map(buildCard).join('')}</div>`
            );
        }
        this.content.innerHTML = `<div class="objects-list-raid-wrapper">${sections.join('')}</div>`;

        if (!this.isMobile) {
            this.content.querySelectorAll('.objects-list-cards--raid').forEach(section => {
                section.addEventListener('contextmenu', this.onCardContextMenu as EventListener, true);
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
        if (this.viewMode === 'list') return;

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

        const descWidth = Math.max(0, ...objects.map((o: any) => (o.desc || "").length));
        const tm = this.client.TeamManager;
        const nextQueuedId = tm?.getEnemyQueue?.()?.[0];

        const queuedEnemyExists = nextQueuedId !== undefined &&
            objects.some((o: any) => typeof o.num !== "undefined" && o.num === nextQueuedId);
        const validNextQueuedId = queuedEnemyExists ? nextQueuedId : undefined;

        const teamAttacking = objects.some((o: any) => {
            return tm?.isInTeam?.(o.desc) && o.attack_num !== false && o.attack_num !== undefined;
        });

        return objects.map((obj: any) => {
            const num = String(obj.shortcut);
            const isPlayer = obj.shortcut === '@';
            let prefix = "  ";
            const isLeader = tm?.isLeader?.();
            const isTeammateForDot = tm?.isInTeam?.(obj.desc || "");

            if (isLeader) {
                if (isPlayer || isTeammateForDot) {
                    if (obj.defense_target) {
                        prefix = `<span class="target-dot target-dot-defense target-dot-active" data-object-num="${num}" data-object-id="${obj.num}" style="color:greenyellow" title="Rozkazanie obrony celu">>></span>`;
                    } else {
                        prefix = `<span class="target-dot target-dot-defense" data-object-num="${num}" data-object-id="${obj.num}" style="color:greenyellow" title="Wyznacz cel obrony">&#8226; </span>`;
                    }
                } else {
                    if (obj.attack_target) {
                        prefix = `<span class="target-dot target-dot-attack target-dot-active" data-object-num="${num}" data-object-id="${obj.num}" style="color:orangered" title="Rozkazanie ataku celu">>></span>`;
                    } else {
                        prefix = `<span class="target-dot target-dot-attack" data-object-num="${num}" data-object-id="${obj.num}" style="color:orangered" title="Wyznacz cel ataku">&#8226; </span>`;
                    }
                }
            } else {
                if (obj.attack_target) {
                    prefix = `<span style="color:orangered">>></span>`;
                } else if (obj.defense_target) {
                    prefix = `<span style="color:greenyellow">>></span>`;
                }
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
                : `${prefix}<span class="${numClasses.join(" ")}" data-object-id="${obj.num}" data-object-num="${num}"${numStyle} title="Zaatakuj">${num}</span>`;

            const rawDesc = obj.desc || "";
            const isTeammate = tm?.isInTeam?.(rawDesc);
            const isAttacking = obj.attack_num !== false && obj.attack_num !== undefined;

            const filterContext: EntryContext = {
                object: obj,
                displayNum: parseInt(num, 10),
                isTarget: obj.avatar_target || false,
                isNextTarget: isNextQueued,
                isTeammate: isTeammate || false,
                rawDescription: rawDesc,
                isAttacking,
                attackCommand: this.attackController.getAttackCommand()
            };
            const filterResult = objectListFilters.apply(filterContext);

            if (filterResult.content?.numberLabel !== undefined) {
                numLabel = filterResult.content.numberLabel;
            }

            let descriptionColor: string | undefined;
            const descClasses = [] as string[];

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

            if (filterResult.style?.descriptionColor) {
                descriptionColor = filterResult.style.descriptionColor;
            }

            if (filterResult.style?.italic) {
                descClasses.push("team-not-attacking");
            }

            if (filterResult.style?.cssClasses) {
                descClasses.push(...filterResult.style.cssClasses);
            }

            const displayDesc = filterResult.content?.description !== undefined
                ? filterResult.content.description
                : rawDesc;

            let coloredDesc = displayDesc;
            if (!isPlayer && (descriptionColor || filterResult.style?.descriptionBackgroundColor)) {
                const classAttr = descClasses.length ? ` class="${descClasses.join(" ")}"` : "";
                let style = "";
                if (descriptionColor) {
                    style += `color:${descriptionColor};`;
                }
                if (filterResult.style?.descriptionBackgroundColor) {
                    style += `background-color:${filterResult.style.descriptionBackgroundColor};`;
                }
                coloredDesc = `<span${classAttr} style="${style}">${displayDesc}</span>`;
            }

            const padding = " ".repeat(Math.max(0, descWidth - rawDesc.length));
            const isTeammateStr = isTeammate ? "true" : "false";
            const desc = isPlayer
                ? `${displayDesc}${padding}`
                : `<span class="object-desc" data-object-id="${obj.num}" data-object-num="${num}" data-object-desc="${rawDesc}" data-teammate="${isTeammateStr}" title="Zaslon">${coloredDesc}</span>${padding}`;

            let bar = "";
            if (filterResult.content?.hpBar !== undefined) {
                bar = filterResult.content.hpBar;
            } else if (typeof obj.hp === "number") {
                const hp = Math.max(0, Math.min(6, obj.hp)) + 1;
                const colorLevel = getColorLevel(hp, 7, false, true);
                let color = COLOR_OBJECT[colorLevel];

                if (filterResult.style?.hpBarColor) {
                    color = filterResult.style.hpBarColor;
                }

                const filled = "#".repeat(hp);
                const empty = "-".repeat(7 - hp);
                const hpBarContent = `[<span style="color:${color}">${filled}${empty}</span>]`;
                if (!isPlayer && !isTeammate) {
                    bar = `<span class="object-hp-bar" data-object-num="${num}" data-object-id="${obj.num}" title="Przelam">${hpBarContent}</span>`;
                } else if (isTeammate) {
                    bar = `<span class="object-hp-bar-teammate" data-object-num="${num}" data-object-id="${obj.num}" title="Wycofaj sie">${hpBarContent}</span>`;
                } else {
                    bar = hpBarContent;
                }
            }

            const attackers = objects
                .filter((o: any) => o.attack_num === obj.num)
                .map((o: any) => o.shortcut);
            const arrow = attackers.length ? ` <- ${attackers.join(" ")}` : "";

            const customPrefix = filterResult.style?.prefix || "";
            const customSuffix = filterResult.style?.suffix || "";

            return `${numLabel} ${bar} ${customPrefix}${desc}${customSuffix}${arrow}`.trimEnd();
        });
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
