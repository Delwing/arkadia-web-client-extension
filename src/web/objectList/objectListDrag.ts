// Dragging the floating object list (no layout manager) by its background,
// remembering where it was dropped and keeping it inside the viewport.

import {globalStorage} from "@modules/core/storage";
import type {ObjectListViewMode} from "./context.ts";

/** Parts of a row that act on a press, so a press on them never starts a drag. */
const NO_DRAG_SELECTOR = ".object-num, .object-desc, .objects-list-controls, .target-dot, .object-hp-bar, .object-hp-bar-teammate, .object-card__icon, .object-card__hp-bar, .object-card__hp-bar--teammate, .object-card__hp-bar-vertical, .object-card__hp-bar-vertical--teammate, .object-card__hp-dots, .object-card__hp-dots--teammate, .object-card__number, .object-card__name, .obj";

export class ObjectListDrag {
    private isDragging = false;
    private startX = 0;
    private startY = 0;
    private offsetLeft = 0;
    private offsetTop = 0;
    private pointerId = 0;

    constructor(
        private readonly container: HTMLElement | null,
        private readonly isMobile: boolean,
        private readonly getViewMode: () => ObjectListViewMode,
    ) {
        this.setup();
        window.addEventListener("resize", this.clampToViewport);
    }

    private setup() {
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
        // The list may not be in the page yet (the shell places it right after
        // start-up); a detached element measures nothing and would be reset to 0,0.
        if (this.container.isConnected) {
            this.clampToViewport();
        } else {
            requestAnimationFrame(() => this.clampToViewport());
        }

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
        const viewMode = this.getViewMode();

        // In card view, don't interfere with clicks on card elements (allows context menu)
        if (isMousePointer && (viewMode === 'card' || viewMode === 'compact' || viewMode === 'compact-dots' || viewMode === 'raid') && target?.closest(".object-card")) {
            return;
        }

        if (isMousePointer && target?.closest(NO_DRAG_SELECTOR)) {
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
        if (!this.container?.isConnected) return;
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
}
