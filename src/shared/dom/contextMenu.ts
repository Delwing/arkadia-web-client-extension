export type ContextMenuEntry = {
    label: string | Node;
    action: () => void;
    opensWindow?: boolean;
};

export type ContextMenuOptions = {
    header?: string;
    smallHeader?: boolean;
    columns?: number;
    compact?: boolean;
};

let contextMenuElement: HTMLElement | null = null;
let initialized = false;

function ensureContextMenu(): HTMLElement | null {
    if (!contextMenuElement) {
        contextMenuElement = document.getElementById('context-menu') as HTMLElement | null;
    }
    if (!initialized) {
        initialized = true;
        document.addEventListener('click', hideContextMenu);
    }
    return contextMenuElement;
}

export function hideContextMenu(): void {
    const menu = ensureContextMenu();
    if (!menu) {
        return;
    }
    menu.classList.remove('show');
    // Remove any columns class
    menu.className = menu.className.replace(/context-menu--columns-\d+/g, '').trim();
    menu.innerHTML = '';
    menu.style.visibility = '';
}

export function showContextMenu(
    items: ContextMenuEntry[],
    x: number,
    y: number,
    options?: ContextMenuOptions,
): void {
    const menu = ensureContextMenu();
    if (!menu) {
        return;
    }

    hideContextMenu();

    // Apply columns class if specified
    const columns = options?.columns;
    if (columns && columns > 1) {
        menu.classList.add(`context-menu--columns-${columns}`);
    }

    const header = options?.header;
    if (header) {
        const headerEl = document.createElement('div');
        headerEl.className = 'context-menu-header';
        if (options?.smallHeader) {
            headerEl.classList.add('context-menu-header-small');
        }
        headerEl.textContent = header;
        menu.appendChild(headerEl);
    }

    // Create buttons container for grid layout when using columns
    const buttonsContainer = columns && columns > 1 ? document.createElement('div') : null;
    if (buttonsContainer) {
        buttonsContainer.className = 'context-menu-buttons';
        menu.appendChild(buttonsContainer);
    }

    items.forEach((item) => {
        const btn = document.createElement('button');
        if (item.opensWindow) {
            btn.classList.add('opens-window');
        }
        if (typeof item.label === 'string') {
            btn.textContent = item.label;
        } else {
            btn.appendChild(item.label.cloneNode(true));
        }
        btn.onclick = () => {
            hideContextMenu();
            item.action();
            const input = document.getElementById('message-input') as HTMLTextAreaElement | null;
            if (input) {
                input.focus();
                input.select();
            }
        };
        (buttonsContainer || menu).appendChild(btn);
    });

    menu.style.left = '0px';
    menu.style.top = '0px';
    menu.style.visibility = 'hidden';
    menu.classList.add('show');

    const rect = menu.getBoundingClientRect();
    const viewportWidth = document.documentElement?.clientWidth ?? window.innerWidth ?? 0;
    const viewportHeight = document.documentElement?.clientHeight ?? window.innerHeight ?? 0;

    let left = x;
    let top = y;

    if (left + rect.width > viewportWidth) {
        left = Math.max(0, viewportWidth - rect.width);
    }

    if (top + rect.height > viewportHeight) {
        top = Math.max(0, viewportHeight - rect.height);
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = '';
}
