// The object lists ("Kondycje" and its non-team window): keeps them rendered
// from the client's objects in the chosen view flavor. The pieces it wires
// together each live in their own file: the view flavors (strategies.ts), the
// mouse handling (ObjectListEventHandlers.ts), dragging the floating window
// (objectListDrag.ts) and the Picture-in-Picture copy (pip/).

import Client from "@client/Client";
import {globalStorage} from "@modules/core/storage";
import {onBehaviorSettingsChange, onRenderSettingsChange} from "@modules/core/settings";
import {createAttackController} from "@client/utils/attackController";
import eventBus from "@modules/core/eventBus";
import {getBuiltInPanelSetting, loadLayoutState, subscribeToPanelSetting} from "../layout/utils/layoutStorage";
import {LEADER_MARK_SETTING, SEPARATE_OTHERS_SETTING} from "../layout/types";
import {buildRenderContext, scopeRenderContext, type ObjectListViewMode, type RenderContext} from "./context.ts";
import {getStrategy, renderListLines} from "./strategies/index.ts";
import {ObjectListEventHandlers} from "./ObjectListEventHandlers.ts";
import {ObjectListDrag} from "./objectListDrag.ts";
import {PictureInPictureSync} from "./pip/PictureInPictureSync.ts";

const EMPTY_HTML = '<span style="color: #888; font-style: italic;">Brak obiektów</span>';

export default class ObjectList {
    private client: Client;
    private readonly container: HTMLElement | null;
    private readonly content: HTMLElement | null;
    /** The second window (#objects-list-others) that takes everyone outside the team. */
    private readonly othersContainer: HTMLElement | null;
    private readonly othersContent: HTMLElement | null;
    private separateOthers = false;
    private objectListPanelEnabled = true;
    private isMobile = false;
    private attackController: ReturnType<typeof createAttackController>;
    private readonly handlers: ObjectListEventHandlers;
    private readonly pip: PictureInPictureSync;
    private viewMode: ObjectListViewMode = 'list';
    private isLayoutManagerEnabled = false;
    private renderScheduled = false;

    /**
     * `lists` are the elements to fill: Kondycje and its non-team window. They
     * may not be in the page yet; by default they are looked up by id.
     */
    constructor(
        client: Client,
        lists: { list: HTMLElement | null; others: HTMLElement | null } = {
            list: document.getElementById("objects-list"),
            others: document.getElementById("objects-list-others"),
        },
    ) {
        this.client = client;
        this.container = lists.list;
        this.content = this.setupContainer(this.container);
        this.othersContainer = lists.others;
        this.othersContent = this.setupContainer(this.othersContainer);
        this.isMobile = this.isMobileBrowser();
        this.attackController = createAttackController(client);
        this.handlers = new ObjectListEventHandlers({
            client,
            attackController: this.attackController,
            isMobile: this.isMobile,
            getViewMode: () => this.viewMode,
            containsTarget: (target) =>
                !!(this.container?.contains(target) || this.content?.contains(target) || this.othersContainer?.contains(target)),
            getForeignDocument: () => this.pip.document,
        });
        // Owns its listeners for as long as the page lives.
        new ObjectListDrag(this.container, this.isMobile, () => this.viewMode);
        if (!this.isMobile) {
            this.handlers.attach(this.container);
            // Also attach to content for better event capture in docked panels
            this.content?.addEventListener("click", this.handlers.onClick);
            this.content?.addEventListener("contextmenu", this.handlers.onContextMenu);
            this.handlers.attach(this.othersContainer);
            // Use capture phase at document level for card view contextmenu
            document.addEventListener("contextmenu", this.handlers.onDocumentContextMenu, true);
        }
        this.client.on("attackQueueChange", () => this.scheduleRender());
        this.client.on("gmcp.objects.nums", () => this.scheduleRender());
        this.client.on("gmcp.objects.data", () => this.scheduleRender());
        this.client.on("gmcp.char.state", () => this.scheduleRender());
        this.client.on("enemy.paralyzed", () => this.scheduleRender());
        this.client.on("enemy.paralyzed.end", () => this.scheduleRender());
        this.client.on("enemy.broken_defense", () => this.scheduleRender());
        this.client.on("objects.linkdead", () => this.scheduleRender());
        this.pip = new PictureInPictureSync({
            client,
            container: this.container,
            content: this.content,
            isMobile: this.isMobile,
            handlers: this.handlers,
            buildBodyLines: () => this.buildListViewLinesForPip(),
        });
        this.client.on("output-sent", () => this.pip.handleOutputUpdate());
        this.client.on("buffer-sent", () => this.pip.handleOutputUpdate());
        this.handlers.loadContextMenuCommands();
        this.initializeCardViewMode();
        this.separateOthers = getBuiltInPanelSetting<boolean>('objectList', SEPARATE_OTHERS_SETTING, false) === true;
        subscribeToPanelSetting('builtIn', 'objectList', SEPARATE_OTHERS_SETTING, (value) => {
            this.separateOthers = value === true;
            this.scheduleRender();
        });
        // The render context reads the setting itself; this only repaints.
        subscribeToPanelSetting('builtIn', 'objectList', LEADER_MARK_SETTING, () => this.scheduleRender());
        // The PiP toggle lives in the panel header now (ObjectListHeaderActions);
        // it drives the window through this event and reflects the open/closed
        // state via `objectList.pipActiveChanged`.
        eventBus.on('objectList.togglePip', () => { void this.pip.toggle(); });
        eventBus.on('layoutManagerStateChanged', this.handleLayoutManagerStateChange);
        // Cover markers: redraw when the cover graph or the toggle changes.
        eventBus.on('cover.state', () => this.scheduleRender());
        onRenderSettingsChange(() => this.scheduleRender());
        onBehaviorSettingsChange(() => {
            this.handlers.loadContextMenuCommands();
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
        this.objectListPanelEnabled = layoutState.enabledPanels.objectList;
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
        // An import or reset can flip the split without a setting notification.
        const separateOthers = getBuiltInPanelSetting<boolean>('objectList', SEPARATE_OTHERS_SETTING, false) === true;
        if (separateOthers !== this.separateOthers || layoutState.enabledPanels.objectList !== this.objectListPanelEnabled) {
            this.separateOthers = separateOthers;
            this.objectListPanelEnabled = layoutState.enabledPanels.objectList;
            this.scheduleRender();
        }
        if (isEnabled === this.isLayoutManagerEnabled) {
            return;
        }
        this.isLayoutManagerEnabled = isEnabled;
        this.syncViewModeWithLayoutState(isEnabled);
    };

    private syncViewModeWithLayoutState(isLayoutEnabled: boolean) {
        const nextViewMode = isLayoutEnabled
            ? getBuiltInPanelSetting<ObjectListViewMode>('objectList', 'viewMode', 'list')
            : 'list';
        if (this.viewMode !== nextViewMode) {
            this.viewMode = nextViewMode;
            this.render();
        }
    }

    private setupContainer(container: HTMLElement | null) {
        if (!container) return null;
        // Only its own content: a layout panel may already have put the timers bar in.
        container.querySelector(":scope > .objects-list-content")?.remove();
        const content = document.createElement("div");
        content.className = "objects-list-content";
        container.appendChild(content);
        return content;
    }

    /**
     * The non-team objects get their own window only in the layout manager,
     * where that window can exist; otherwise the one list shows everybody.
     */
    private isSplit(): boolean {
        return this.separateOthers && this.isLayoutManagerEnabled && this.objectListPanelEnabled && !!this.othersContent;
    }

    private isMobileBrowser() {
        return (
            typeof navigator !== "undefined" &&
            /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
            )
        );
    }

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
        const split = this.isSplit();
        const ctx = buildRenderContext(this.client, objects, this.attackController.getAttackCommand());
        this.renderInto(this.content, scopeRenderContext(ctx, split ? 'team' : 'all'));
        if (this.othersContent) {
            if (split) {
                this.renderInto(this.othersContent, scopeRenderContext(ctx, 'others'));
            } else {
                this.othersContent.innerHTML = "";
            }
        }
        this.pip.rebuild();
    }

    private renderInto(content: HTMLElement, ctx: RenderContext) {
        // Show placeholder if no objects
        if (ctx.objects.length === 0) {
            content.innerHTML = EMPTY_HTML;
            return;
        }

        const strategy = getStrategy(this.viewMode);
        content.innerHTML = strategy.render(ctx);

        // Card-family flavors need the capture-phase context menu on each cards
        // container (raid renders several); other flavors use the delegated
        // onContextMenu via each row's data-object-id.
        if (strategy.cardContextMenu && !this.isMobile) {
            content.querySelectorAll('.objects-list-cards').forEach((el) => {
                el.addEventListener('contextmenu', this.handlers.onCardContextMenu as EventListener, true);
            });
        }
    }

    /** Always the list flavor in PiP, whatever the current viewMode. */
    private buildListViewLinesForPip(): string[] {
        const manager = this.client.ObjectManager;
        if (!manager) return [];
        const objects = manager.getObjectsOnLocation();

        if (objects.length === 0) {
            return [EMPTY_HTML];
        }

        const ctx = buildRenderContext(this.client, objects, this.attackController.getAttackCommand());
        return renderListLines(ctx);
    }
}
