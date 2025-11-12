export type ContextMenuEntry = {
    label: string | Node;
    action: () => void;
};

export type ContextMenuOptions = {
    header?: string;
    smallHeader?: boolean;
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

    items.forEach((item) => {
        const btn = document.createElement('button');
        if (typeof item.label === 'string') {
            btn.textContent = item.label;
        } else {
            btn.appendChild(item.label.cloneNode(true));
        }
        btn.onclick = () => {
            hideContextMenu();
            item.action();
        };
        menu.appendChild(btn);
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
