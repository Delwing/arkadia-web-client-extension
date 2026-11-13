// Mouse handling for the object lists (main, non-team window and the
// Picture-in-Picture copy). Every view flavor tags its clickable parts with
// `data-object-num` / `data-object-id` (+ `data-action`), so these delegated
// handlers turn a click into a game command and a right click into the
// object's context menu, whichever flavor is showing.

import type Client from "@client/Client";
import {getBehaviorSettings} from "@modules/core/settings";
import type {createAttackController} from "@client/utils/attackController";
import {hideContextMenu, showContextMenu} from "@web/contextMenu";
import type {ObjectListViewMode} from "./context.ts";
import {buildObjectContextMenu} from "./objectContextMenu.ts";

const DEFAULT_CONTEXT_MENU_COMMANDS = ['ob', 'ocen', 'zapros', 'wskaz'];

export interface ObjectListEventHost {
    client: Client;
    attackController: ReturnType<typeof createAttackController>;
    isMobile: boolean;
    getViewMode(): ObjectListViewMode;
    /** Whether a right click on this node belongs to one of the lists. */
    containsTarget(target: Node): boolean;
    /** The PiP window's document, whose elements come from another realm. */
    getForeignDocument(): Document | null;
}

export class ObjectListEventHandlers {
    private contextMenuCommands: string[] = DEFAULT_CONTEXT_MENU_COMMANDS;
    private pressedTarget: Element | null = null;
    private suppressClick = false;

    constructor(private readonly host: ObjectListEventHost) {}

    private get client() {
        return this.host.client;
    }

    private get attackController() {
        return this.host.attackController;
    }

    loadContextMenuCommands() {
        const commands = getBehaviorSettings().objectContextMenuCommands;
        if (Array.isArray(commands) && commands.length > 0) {
            this.contextMenuCommands = commands.filter((c: unknown) => typeof c === 'string');
        } else {
            this.contextMenuCommands = DEFAULT_CONTEXT_MENU_COMMANDS;
        }
    }

    /** Press, release, click and right click on a list's element. */
    attach(el: HTMLElement | null) {
        el?.addEventListener("mousedown", this.onMouseDown);
        el?.addEventListener("mouseup", this.onMouseUp);
        el?.addEventListener("click", this.onClick);
        el?.addEventListener("contextmenu", this.onContextMenu);
    }

    detach(el: HTMLElement | null) {
        el?.removeEventListener("mousedown", this.onMouseDown);
        el?.removeEventListener("mouseup", this.onMouseUp);
        el?.removeEventListener("click", this.onClick);
        el?.removeEventListener("contextmenu", this.onContextMenu);
    }

    private getEventTargetElement(target: EventTarget | null): Element | null {
        if (!target) return null;
        if (target instanceof Element) {
            return target;
        }
        const pipElementCtor = this.host.getForeignDocument()?.defaultView?.Element;
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

    onMouseDown = (e: MouseEvent) => {
        this.pressedTarget = this.getEventTargetElement(e.target);
    };

    /**
     * In combat the list re-renders on nearly every hit. React keeps an
     * object's elements across renders, but one can still be replaced under the
     * press (its row changes shape, the view switches), and then the browser
     * fires no click at all, so a dot or HP bar click would be lost. When the
     * release lands on the same object in the fresh render, treat it as the click.
     */
    onMouseUp = (e: MouseEvent) => {
        const pressed = this.pressedTarget;
        this.pressedTarget = null;
        if (e.button !== 0 || !pressed || pressed.isConnected) return;
        const released = this.getEventTargetElement(e.target);
        const pressedId = pressed.closest("[data-object-id]")?.getAttribute("data-object-id");
        if (!pressedId || released?.closest("[data-object-id]")?.getAttribute("data-object-id") !== pressedId) return;
        this.onClick(e);
        // Should a browser still fire a click for this press, don't act twice.
        this.suppressClick = true;
        setTimeout(() => { this.suppressClick = false; });
    };

    onClick = (e: MouseEvent) => {
        if (this.host.isMobile) return;
        if (this.suppressClick) {
            this.suppressClick = false;
            return;
        }
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

    onContextMenu = (e: MouseEvent) => {
        if (this.host.isMobile) return;
        const target = e.target as HTMLElement | null;
        if (!target) return;

        let objectId: string | null = null;
        const viewMode = this.host.getViewMode();

        // In card view, find the parent card element
        if (viewMode === 'card' || viewMode === 'compact' || viewMode === 'compact-dots' || viewMode === 'raid') {
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

        this.showObjectMenu(objectId, e.clientX, e.clientY);
    };

    private showObjectMenu(objectId: string, x: number, y: number) {
        const object = this.client.ObjectManager?.getObjectsOnLocation()
            ?.find((o: { num?: number }) => String(o?.num) === objectId);
        const desc = typeof object?.desc === 'string' ? object.desc : undefined;
        const { items, options } = buildObjectContextMenu(
            { id: objectId, desc, teammate: Boolean(desc && this.client.TeamManager?.isInTeam?.(desc)) },
            this.contextMenuCommands,
            (command) => this.client.sendCommand(command),
        );
        showContextMenu(items, x, y, options);
    }

    /** Capture-phase listener for each `.objects-list-cards` container of the card-family flavors. */
    /** Capture-phase listener on the document, for the card-family flavors. */
    onDocumentContextMenu = (e: MouseEvent) => {
        // list + nearby use the delegated onContextMenu (row data-object-id);
        // only the card-family flavors need the capture-phase card lookup.
        const viewMode = this.host.getViewMode();
        if (viewMode === 'list' || viewMode === 'nearby') return;

        const target = e.target as HTMLElement | null;
        if (!target) return;

        // Check if click is inside our container
        if (!this.host.containsTarget(target)) return;

        const cardEl = target.closest('.object-card') as HTMLElement | null;
        if (!cardEl) return;

        const objectId = cardEl.getAttribute('data-object-id');
        if (!objectId) return;

        if (this.contextMenuCommands.length === 0) return;

        e.preventDefault();
        e.stopPropagation();

        this.showObjectMenu(objectId, e.clientX, e.clientY);
    };
}
