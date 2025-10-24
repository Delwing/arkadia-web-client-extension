import {Modal} from "bootstrap";
import type {
    PluginMenuButtonOptions,
    PluginModalHandle,
    PluginModalOptions,
    PluginUIHooks,
    PluginUIManager,
} from "@client/src/plugins/api";

interface PluginUIState {
    disposers: Set<() => void>;
    modals: Set<PluginModalController>;
}

interface ModalElements {
    element: HTMLElement;
    title: HTMLElement;
    body: HTMLElement;
    footer: HTMLElement | null;
    dialog: HTMLElement;
}

class PluginModalController implements PluginModalHandle {
    readonly element: HTMLElement;
    readonly body: HTMLElement;
    readonly footer: HTMLElement | null;
    private disposed = false;

    constructor(
        private readonly modal: Modal,
        elements: ModalElements,
        private readonly onDispose: () => void,
    ) {
        this.element = elements.element;
        this.body = elements.body;
        this.footer = elements.footer;
        this.titleEl = elements.title;
    }

    private readonly titleEl: HTMLElement;

    setTitle(title: string): void {
        this.titleEl.textContent = title;
    }

    setBody(content?: string | Node | null): void {
        applyContent(this.body, content);
    }

    setFooter(content?: string | Node | null): void {
        if (!this.footer) {
            return;
        }
        applyContent(this.footer, content);
        toggleFooterVisibility(this.footer, content);
    }

    show(): void {
        this.modal.show();
    }

    hide(): void {
        this.modal.hide();
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        try {
            this.modal.hide();
        } catch {}
        this.modal.dispose();
        this.element.remove();
        this.onDispose();
    }
}

function applyContent(target: HTMLElement, content?: string | Node | null) {
    while (target.firstChild) {
        target.removeChild(target.firstChild);
    }
    if (content == null) {
        return;
    }
    if (typeof content === "string") {
        target.textContent = content;
    } else {
        target.appendChild(content);
    }
}

function toggleFooterVisibility(footer: HTMLElement, content?: string | Node | null) {
    if (content == null || (typeof content === "string" && content.length === 0)) {
        footer.classList.add("d-none");
    } else {
        footer.classList.remove("d-none");
    }
}

function resolveMenuElements(doc: Document) {
    const menu = doc.getElementById("menu-dropdown") as HTMLUListElement | null;
    const divider = doc.getElementById("plugin-menu-divider") as HTMLLIElement | null;
    if (!menu || !divider) {
        throw new Error("Plugin menu elements are missing in the DOM.");
    }
    return {menu, divider};
}

function resolveModalElements(doc: Document) {
    const template = doc.getElementById("plugin-modal-template") as HTMLTemplateElement | null;
    const container = doc.getElementById("plugin-modal-container") as HTMLElement | null;
    if (!template || !container) {
        throw new Error("Plugin modal template or container is missing in the DOM.");
    }
    return {template, container};
}

export default function createPluginUIManager(doc: Document = document): PluginUIManager {
    const pluginStates = new Map<string, PluginUIState>();
    let menuRef: HTMLUListElement | null = null;
    let dividerRef: HTMLLIElement | null = null;
    let templateRef: HTMLTemplateElement | null = null;
    let containerRef: HTMLElement | null = null;
    let buttonCount = 0;

    const getMenuElements = () => {
        if (!menuRef || !menuRef.isConnected || !dividerRef || !dividerRef.isConnected) {
            const resolved = resolveMenuElements(doc);
            menuRef = resolved.menu;
            dividerRef = resolved.divider;
        }
        return {menu: menuRef!, divider: dividerRef!};
    };

    const getModalElements = () => {
        if (!templateRef || !containerRef || !containerRef.isConnected) {
            const resolved = resolveModalElements(doc);
            templateRef = resolved.template;
            containerRef = resolved.container;
        }
        return {template: templateRef!, container: containerRef!};
    };

    const ensureState = (pluginUrl: string): PluginUIState => {
        let state = pluginStates.get(pluginUrl);
        if (!state) {
            state = {
                disposers: new Set(),
                modals: new Set(),
            };
            pluginStates.set(pluginUrl, state);
        }
        return state;
    };

    const removeStateIfEmpty = (pluginUrl: string) => {
        const state = pluginStates.get(pluginUrl);
        if (!state) {
            return;
        }
        if (state.disposers.size === 0 && state.modals.size === 0) {
            pluginStates.delete(pluginUrl);
        }
    };

    const updateDivider = () => {
        if (buttonCount <= 0) {
            const {divider} = getMenuElements();
            divider.classList.add("d-none");
            buttonCount = 0;
        } else {
            const {divider} = getMenuElements();
            divider.classList.remove("d-none");
        }
    };

    const uiHooksForPlugin = (pluginUrl: string): PluginUIHooks => {
        const state = ensureState(pluginUrl);

        const registerMenuButton = (options: PluginMenuButtonOptions, handler: (event: MouseEvent) => void): (() => void) => {
            const {menu} = getMenuElements();
            const li = doc.createElement("li");
            if (options.id) {
                li.dataset.pluginMenuId = options.id;
            }
            const button = doc.createElement("button");
            button.type = "button";
            button.className = options.className || "w-100 p-1";
            button.textContent = options.label;
            if (options.title) {
                button.title = options.title;
            }
            const clickHandler = (event: MouseEvent) => {
                handler(event);
            };
            button.addEventListener("click", clickHandler);
            li.appendChild(button);

            const target = resolveInsertTarget(menu, options.beforeId);
            menu.insertBefore(li, target);
            buttonCount += 1;
            updateDivider();

            let disposed = false;
            const dispose = () => {
                if (disposed) {
                    return;
                }
                disposed = true;
                button.removeEventListener("click", clickHandler);
                if (li.parentElement) {
                    li.parentElement.removeChild(li);
                }
                state.disposers.delete(dispose);
                buttonCount -= 1;
                updateDivider();
                removeStateIfEmpty(pluginUrl);
            };

            state.disposers.add(dispose);
            return dispose;
        };

        const openModal = (options: PluginModalOptions): PluginModalHandle => {
            const {template, container} = getModalElements();
            const instance = instantiateModal(template, container);
            const modal = new Modal(instance.element);
            const controller = new PluginModalController(modal, instance, () => {
                state.modals.delete(controller);
                removeStateIfEmpty(pluginUrl);
            });
            state.modals.add(controller);

            controller.setTitle(options.title);
            controller.setBody(options.body);
            if (options.footer !== undefined) {
                controller.setFooter(options.footer);
            }
            if (options.size) {
                applySize(instance.dialog, options.size);
            }
            if (options.scrollable === false) {
                instance.dialog.classList.remove("modal-dialog-scrollable");
            } else {
                instance.dialog.classList.add("modal-dialog-scrollable");
            }
            if (options.show !== false) {
                controller.show();
            }
            return controller;
        };

        return {
            registerMenuButton,
            openModal,
        };
    };

    return {
        create(pluginUrl: string) {
            return uiHooksForPlugin(pluginUrl);
        },
        dispose(pluginUrl: string) {
            const state = pluginStates.get(pluginUrl);
            if (!state) {
                return;
            }
            Array.from(state.disposers).forEach(dispose => {
                try {
                    dispose();
                } catch (err) {
                    console.error("Failed to dispose plugin menu button", err);
                }
            });
            Array.from(state.modals).forEach(modal => {
                try {
                    modal.dispose();
                } catch (err) {
                    console.error("Failed to dispose plugin modal", err);
                }
            });
            pluginStates.delete(pluginUrl);
            updateDivider();
        },
    };
}

function resolveInsertTarget(menu: HTMLUListElement, beforeId?: string): ChildNode | null {
    if (!beforeId) {
        return null;
    }
    const selector = `[data-plugin-menu-id="${CSS.escape(beforeId)}"]`;
    const candidate = menu.querySelector(selector);
    if (candidate) {
        return candidate as ChildNode;
    }
    return null;
}

function instantiateModal(
    template: HTMLTemplateElement,
    container: HTMLElement,
): ModalElements {
    const fragment = template.content.cloneNode(true) as DocumentFragment;
    const element = fragment.querySelector<HTMLElement>("[data-plugin-modal]");
    if (!element) {
        throw new Error("Plugin modal template is invalid.");
    }
    const title = element.querySelector<HTMLElement>(".modal-title");
    const body = element.querySelector<HTMLElement>(".modal-body");
    const footer = element.querySelector<HTMLElement>(".modal-footer");
    const dialog = element.querySelector<HTMLElement>(".modal-dialog");
    if (!title || !body || !dialog) {
        throw new Error("Plugin modal template is missing required elements.");
    }
    if (footer) {
        toggleFooterVisibility(footer, undefined);
    }
    container.appendChild(element);
    return {element, title, body, footer: footer ?? null, dialog};
}

function applySize(dialog: HTMLElement, size: "sm" | "lg" | "xl") {
    dialog.classList.remove("modal-sm", "modal-lg", "modal-xl");
    if (size === "sm") {
        dialog.classList.add("modal-sm");
    }
    if (size === "lg") {
        dialog.classList.add("modal-lg");
    }
    if (size === "xl") {
        dialog.classList.add("modal-xl");
    }
}
