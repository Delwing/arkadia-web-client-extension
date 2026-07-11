import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
    getContextMenuSnapshot,
    hideContextMenu,
    subscribeContextMenu,
    type ContextMenuEntry,
} from '@web/contextMenu';

/**
 * The forged context menu — right-click actions on herb / book descriptions.
 *
 * It subscribes to the shared `contextMenuStore` (the same singleton the stock
 * UI uses), so it renders every menu regardless of how it was requested: the
 * book menu arrives through the UI port, the herb menu writes to the store
 * directly via `@modules/core/contextMenus`. Both land here.
 *
 * Rendered through a portal to `document.body` so it floats above the sidebar
 * panels and output column instead of being clipped by their `overflow`.
 */

function NodeLabel({ node }: { node: Node }) {
    const ref = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (ref.current) ref.current.replaceChildren(node);
    }, [node]);
    return <span ref={ref} />;
}

function renderLabel(label: ContextMenuEntry['label']): ReactNode {
    if (label && typeof label === 'object' && label instanceof Node) {
        return <NodeLabel node={label} />;
    }
    return label as ReactNode;
}

function Item({ item }: { item: ContextMenuEntry }) {
    return (
        <button
            type="button"
            className={item.opensWindow ? 'opens-window' : undefined}
            onClick={() => {
                // Run the action before hiding: the unmount must not race the
                // click's transient user activation (matches the stock host).
                item.action();
                hideContextMenu();
                const input = document.getElementById('alt-input') as HTMLTextAreaElement | null;
                input?.focus();
            }}
        >
            {renderLabel(item.label)}
        </button>
    );
}

export default function ContextMenu() {
    const snapshot = useSyncExternalStore(
        subscribeContextMenu,
        getContextMenuSnapshot,
        getContextMenuSnapshot,
    );
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

    // Measure after render and flip within the viewport so the menu never
    // overflows the bottom/right edge.
    useLayoutEffect(() => {
        if (!snapshot.visible) {
            setPos(null);
            return;
        }
        const el = menuRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const vw = document.documentElement?.clientWidth ?? window.innerWidth ?? 0;
        const vh = document.documentElement?.clientHeight ?? window.innerHeight ?? 0;
        let left = snapshot.x;
        let top = snapshot.y;
        if (left + rect.width > vw) left = Math.max(0, vw - rect.width);
        if (top + rect.height > vh) top = Math.max(0, vh - rect.height);
        setPos({ x: left, y: top });
    }, [snapshot.visible, snapshot.x, snapshot.y, snapshot.items]);

    // Close on any click/right-click outside the menu. Registered in an effect
    // that runs after this render commits, so the very contextmenu event that
    // opened the menu (already finished dispatching) does not close it again.
    useEffect(() => {
        if (!snapshot.visible) return;
        const onDocumentEvent = (e: Event) => {
            const target = e.target as Node | null;
            if (target && menuRef.current?.contains(target)) return;
            hideContextMenu();
        };
        document.addEventListener('click', onDocumentEvent, true);
        document.addEventListener('contextmenu', onDocumentEvent, true);
        return () => {
            document.removeEventListener('click', onDocumentEvent, true);
            document.removeEventListener('contextmenu', onDocumentEvent, true);
        };
    }, [snapshot.visible]);

    if (!snapshot.visible) return null;

    const header = snapshot.options?.header;
    const smallHeader = snapshot.options?.smallHeader;

    return createPortal(
        <div
            ref={menuRef}
            className="alt-context-menu"
            style={{
                left: pos?.x ?? snapshot.x,
                top: pos?.y ?? snapshot.y,
                visibility: pos ? 'visible' : 'hidden',
            }}
        >
            {header && (
                <div
                    className={
                        'alt-context-menu__header' +
                        (smallHeader ? ' alt-context-menu__header--small' : '')
                    }
                >
                    {header}
                </div>
            )}
            <div className="alt-context-menu__items">
                {snapshot.items.map((item, i) => (
                    <Item key={i} item={item} />
                ))}
            </div>
        </div>,
        document.body,
    );
}
