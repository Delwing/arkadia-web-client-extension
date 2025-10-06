import ArkadiaClient from "./ArkadiaClient.ts";
import {
    LETTER_TEMPLATE_CHOICES,
    LETTER_TEMPLATE_DEFINITIONS,
    isLetterTemplate,
    type LetterSubmitPayload,
    type LetterTemplate,
} from "@client/src/types/letter";

interface LetterComposerState {
    hasCustomPosition: boolean;
}

type SubmitPayload = LetterSubmitPayload;

export default class LetterComposer {
    private static readonly TEMPLATE_STORAGE_KEY = "letter-composer-template";
    private container: HTMLElement | null;
    private header: HTMLElement | null;
    private form: HTMLFormElement | null;
    private toInput: HTMLInputElement | null;
    private ccInput: HTMLInputElement | null;
    private subjectInput: HTMLInputElement | null;
    private contentInput: HTMLTextAreaElement | null;
    private closeButton: HTMLButtonElement | null;
    private previewButton: HTMLButtonElement | null;
    private templateSelect: HTMLSelectElement | null;
    private dragPointerId: number | null = null;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private state: LetterComposerState = { hasCustomPosition: false };
    private templateSelection: LetterTemplate = "plain";

    constructor(private client: typeof ArkadiaClient) {
        this.container = document.getElementById("letter-composer");
        this.header = this.container?.querySelector<HTMLElement>(".letter-composer-header");
        this.form = this.container?.querySelector<HTMLFormElement>("form");
        this.toInput = this.container?.querySelector<HTMLInputElement>("[name='letter-to']");
        this.ccInput = this.container?.querySelector<HTMLInputElement>("[name='letter-cc']");
        this.subjectInput = this.container?.querySelector<HTMLInputElement>("[name='letter-subject']");
        this.contentInput = this.container?.querySelector<HTMLTextAreaElement>("[name='letter-content']");
        this.closeButton = this.container?.querySelector<HTMLButtonElement>("[data-letter-close]");
        this.previewButton = this.container?.querySelector<HTMLButtonElement>("[data-letter-preview]");
        this.templateSelect = this.container?.querySelector<HTMLSelectElement>("[name='letter-template']");
        this.rebuildTemplateOptions();
        this.templateSelection = this.loadTemplateSelection();
        this.applyTemplateSelection(this.templateSelection);

        this.attachListeners();
        this.client.on("letterComposer", () => this.show());
    }

    private getPayload(): SubmitPayload {
        const template = this.getCurrentTemplateSelection();
        this.templateSelection = template;
        this.saveTemplateSelection(template);
        return {
            to: this.toInput?.value ?? "",
            cc: this.ccInput?.value ?? "",
            subject: this.subjectInput?.value ?? "",
            content: this.contentInput?.value ?? "",
            template,
        };
    }

    private attachListeners() {
        if (this.form) {
            this.form.addEventListener("submit", ev => {
                ev.preventDefault();
                const payload = this.getPayload();
                this.client.emit("letterComposer.submit", payload);
                this.hide();
                this.form?.reset();
                this.applyTemplateSelection(this.templateSelection);
            });
        }

        if (this.closeButton) {
            this.closeButton.addEventListener("click", () => this.hide());
        }

        if (this.previewButton) {
            this.previewButton.addEventListener("click", ev => {
                ev.preventDefault();
                const payload = this.getPayload();
                this.client.emit("letterComposer.preview", payload);
            });
        }

        if (this.templateSelect) {
            this.templateSelect.addEventListener("change", () => {
                this.templateSelection = this.getCurrentTemplateSelection();
                this.saveTemplateSelection(this.templateSelection);
            });
        }

        if (this.header && this.container) {
            this.header.addEventListener("pointerdown", ev => this.startDrag(ev));
        }
    }

    private show() {
        if (!this.container) {
            return;
        }
        this.templateSelection = this.loadTemplateSelection();
        this.form?.reset();
        this.applyTemplateSelection(this.templateSelection);
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
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-letter-close]")) {
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

    private isSelectableTemplate(value: unknown): value is LetterTemplate {
        return isLetterTemplate(value) && Boolean(LETTER_TEMPLATE_DEFINITIONS[value]?.supportsJustification);
    }

    private rebuildTemplateOptions() {
        if (!this.templateSelect) {
            return;
        }
        const currentValue = this.templateSelect.value;
        this.templateSelect.innerHTML = "";
        LETTER_TEMPLATE_CHOICES.forEach(definition => {
            const option = document.createElement("option");
            option.value = definition.value;
            option.textContent = definition.displayLabel;
            this.templateSelect!.appendChild(option);
        });

        if (this.isSelectableTemplate(currentValue)) {
            this.templateSelect.value = currentValue;
        } else if (LETTER_TEMPLATE_CHOICES.length > 0) {
            this.templateSelect.value = LETTER_TEMPLATE_CHOICES[0].value;
        }
    }

    private loadTemplateSelection(): LetterTemplate {
        try {
            const stored = localStorage.getItem(LetterComposer.TEMPLATE_STORAGE_KEY);
            if (this.isSelectableTemplate(stored)) {
                return stored;
            }
        } catch {
            // ignore storage errors
        }
        if (this.templateSelect && this.isSelectableTemplate(this.templateSelect.value)) {
            return this.templateSelect.value;
        }
        return LETTER_TEMPLATE_CHOICES[0]?.value ?? "plain";
    }

    private getCurrentTemplateSelection(): LetterTemplate {
        if (this.templateSelect && this.isSelectableTemplate(this.templateSelect.value)) {
            return this.templateSelect.value;
        }
        return LETTER_TEMPLATE_CHOICES[0]?.value ?? "plain";
    }

    private applyTemplateSelection(value: LetterTemplate) {
        if (this.templateSelect) {
            if (this.isSelectableTemplate(value)) {
                this.templateSelect.value = value;
            } else if (LETTER_TEMPLATE_CHOICES.length > 0) {
                this.templateSelect.value = LETTER_TEMPLATE_CHOICES[0].value;
            }
        }
    }

    private saveTemplateSelection(value: LetterTemplate) {
        try {
            localStorage.setItem(LetterComposer.TEMPLATE_STORAGE_KEY, value);
        } catch {
            // ignore storage errors
        }
    }
}
