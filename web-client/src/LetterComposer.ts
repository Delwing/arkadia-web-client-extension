import ArkadiaClient from "./ArkadiaClient.ts";

interface LetterComposerState {
    hasCustomPosition: boolean;
}

interface SubmitPayload {
    to: string;
    cc: string;
    content: string;
}

export default class LetterComposer {
    private container: HTMLElement | null;
    private header: HTMLElement | null;
    private form: HTMLFormElement | null;
    private toInput: HTMLInputElement | null;
    private ccInput: HTMLInputElement | null;
    private contentInput: HTMLTextAreaElement | null;
    private closeButton: HTMLButtonElement | null;
    private dragPointerId: number | null = null;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private state: LetterComposerState = { hasCustomPosition: false };

    constructor(private client: typeof ArkadiaClient) {
        this.container = document.getElementById("letter-composer");
        this.header = this.container?.querySelector<HTMLElement>(".letter-composer-header");
        this.form = this.container?.querySelector<HTMLFormElement>("form");
        this.toInput = this.container?.querySelector<HTMLInputElement>("[name='letter-to']");
        this.ccInput = this.container?.querySelector<HTMLInputElement>("[name='letter-cc']");
        this.contentInput = this.container?.querySelector<HTMLTextAreaElement>("[name='letter-content']");
        this.closeButton = this.container?.querySelector<HTMLButtonElement>("[data-letter-close]");

        this.attachListeners();
        this.client.on("letterComposer", () => this.show());
    }

    private attachListeners() {
        if (this.form) {
            this.form.addEventListener("submit", ev => {
                ev.preventDefault();
                const payload: SubmitPayload = {
                    to: this.toInput?.value ?? "",
                    cc: this.ccInput?.value ?? "",
                    content: this.contentInput?.value ?? "",
                };
                this.client.emit("letterComposer.submit", payload);
                this.hide();
                this.form?.reset();
            });
        }

        if (this.closeButton) {
            this.closeButton.addEventListener("click", () => this.hide());
        }

        if (this.header && this.container) {
            this.header.addEventListener("pointerdown", ev => this.startDrag(ev));
        }
    }

    private show() {
        if (!this.container) {
            return;
        }
        this.container.hidden = false;
        requestAnimationFrame(() => {
            if (!this.state.hasCustomPosition) {
                this.center();
            }
            this.toInput?.focus();
        });
    }

    private hide() {
        if (!this.container) {
            return;
        }
        this.container.hidden = true;
    }

    private center() {
        if (!this.container) {
            return;
        }
        const width = this.container.offsetWidth || 420;
        const height = this.container.offsetHeight || 320;
        const left = Math.max(16, (window.innerWidth - width) / 2);
        const top = Math.max(16, (window.innerHeight - height) / 4);
        this.container.style.left = `${left}px`;
        this.container.style.top = `${top}px`;
    }

    private startDrag(event: PointerEvent) {
        if (!this.container || !this.header) {
            return;
        }
        if (event.button !== 0 && event.pointerType !== "touch" && event.pointerType !== "pen") {
            return;
        }
        this.dragPointerId = event.pointerId;
        const rect = this.container.getBoundingClientRect();
        this.dragOffsetX = event.clientX - rect.left;
        this.dragOffsetY = event.clientY - rect.top;
        this.header.setPointerCapture(event.pointerId);
        document.addEventListener("pointermove", this.handlePointerMove);
        document.addEventListener("pointerup", this.handlePointerUp);
    }

    private handlePointerMove = (event: PointerEvent) => {
        if (!this.container || this.dragPointerId !== event.pointerId) {
            return;
        }
        const maxLeft = Math.max(0, window.innerWidth - this.container.offsetWidth);
        const maxTop = Math.max(0, window.innerHeight - this.container.offsetHeight);
        let left = event.clientX - this.dragOffsetX;
        let top = event.clientY - this.dragOffsetY;
        left = Math.min(Math.max(0, left), maxLeft);
        top = Math.min(Math.max(0, top), maxTop);
        this.container.style.left = `${left}px`;
        this.container.style.top = `${top}px`;
        this.state.hasCustomPosition = true;
    };

    private handlePointerUp = (event: PointerEvent) => {
        if (this.dragPointerId !== event.pointerId) {
            return;
        }
        this.dragPointerId = null;
        if (this.header) {
            this.header.releasePointerCapture(event.pointerId);
        }
        document.removeEventListener("pointermove", this.handlePointerMove);
        document.removeEventListener("pointerup", this.handlePointerUp);
    };
}
