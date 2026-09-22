/**
 * The stock UI's page-level windows (Ustawienia, Aliasy, Triggery, Bindowanie…):
 * declared once in index.html as `.app-modal` and opened by id. Replaces
 * Bootstrap's Modal JS.
 *
 * An open modal is its own backdrop; the frame inside is `.app-modal__dialog`.
 * Several can be open at once (Postacie over Ustawienia): each one opened
 * stacks above the last, and Escape or a backdrop click closes only the top one.
 *
 * There is no focus trap, on purpose. Dialogs rendered inside these windows
 * (the Dialog primitive) manage their own focus, and two focus managers
 * fighting over the same keystroke is what made Bootstrap's modals freeze
 * inputs. The modal takes focus when it opens and gives it back when it closes.
 *
 * Panels living in a modal follow it through the events in {@link MODAL_EVENT},
 * dispatched on the modal element (they do not bubble).
 */

export const MODAL_EVENT = {
    /** About to open; the content is still hidden. */
    show: "app-modal:show",
    /** Open and laid out. */
    shown: "app-modal:shown",
    /** About to close. */
    hide: "app-modal:hide",
    /** Closed. */
    hidden: "app-modal:hidden",
} as const;

// The first window lands on 1055, where Bootstrap put its modals, so overlays tuned
// against that keep their place; each stacked one goes 10 higher.
const BASE_Z = 1045;
const Z_STEP = 10;

const instances = new WeakMap<HTMLElement, AppModal>();
const stack: AppModal[] = [];

export class AppModal {
    private returnFocus: HTMLElement | null = null;

    private constructor(readonly element: HTMLElement) {
        element.addEventListener("mousedown", (event) => {
            // mousedown, not click: a text selection dragged out of an input and
            // released over the backdrop must not close the window.
            if (event.target === element) this.hide();
        });
        element.addEventListener("click", (event) => {
            if ((event.target as Element).closest("[data-modal-dismiss]")) this.hide();
        });
        element.addEventListener("keydown", (event) => {
            if (event.key !== "Escape" || event.defaultPrevented || stack[stack.length - 1] !== this) return;
            event.preventDefault();
            this.hide();
        });
    }

    /** The controller for a `.app-modal` element (one per element). */
    static for(element: HTMLElement): AppModal {
        let modal = instances.get(element);
        if (!modal) {
            modal = new AppModal(element);
            instances.set(element, modal);
        }
        return modal;
    }

    /** The controller for the modal with this id, or null when the page has none. */
    static byId(id: string): AppModal | null {
        const element = document.getElementById(id);
        return element ? AppModal.for(element) : null;
    }

    get isOpen(): boolean {
        return stack.includes(this);
    }

    show(): void {
        if (this.isOpen) return;
        this.element.dispatchEvent(new Event(MODAL_EVENT.show));
        const active = document.activeElement;
        this.returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
        stack.push(this);
        this.element.style.zIndex = String(BASE_Z + stack.length * Z_STEP);
        this.element.hidden = false;
        document.body.classList.add("app-modal-open");
        requestAnimationFrame(() => {
            if (!this.isOpen) return;
            if (!this.element.contains(document.activeElement)) {
                this.element.querySelector<HTMLElement>(".app-modal__dialog")?.focus({ preventScroll: true });
            }
            this.element.dispatchEvent(new Event(MODAL_EVENT.shown));
        });
    }

    hide(): void {
        const at = stack.indexOf(this);
        if (at < 0) return;
        this.element.dispatchEvent(new Event(MODAL_EVENT.hide));
        stack.splice(at, 1);
        const hadFocus = this.element.contains(document.activeElement);
        this.element.hidden = true;
        this.element.style.zIndex = "";
        if (stack.length === 0) document.body.classList.remove("app-modal-open");
        if (hadFocus) {
            const back = this.returnFocus?.isConnected ? this.returnFocus : null;
            if (back) back.focus({ preventScroll: true });
            else (document.activeElement as HTMLElement | null)?.blur?.();
        }
        this.returnFocus = null;
        this.element.dispatchEvent(new Event(MODAL_EVENT.hidden));
    }

    toggle(): void {
        if (this.isOpen) this.hide();
        else this.show();
    }
}

/** Some page-level modal is open (global keybinds and Enter-to-send stand down). */
export function isAnyModalOpen(): boolean {
    return stack.length > 0;
}
