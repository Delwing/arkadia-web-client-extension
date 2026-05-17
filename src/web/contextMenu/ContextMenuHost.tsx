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
} from './contextMenuStore';

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
                // Run action BEFORE hiding so Safari's transient user activation
                // (clipboard.write etc.) isn't invalidated by the unmount.
                item.action();
                hideContextMenu();
                const input = document.getElementById('message-input') as HTMLTextAreaElement | null;
                if (input) {
                    input.focus();
                    input.select();
                }
            }}
        >
            {renderLabel(item.label)}
        </button>
    );
}

export function ContextMenuHost() {
    const snapshot = useSyncExternalStore(
        subscribeContextMenu,
        getContextMenuSnapshot,
        getContextMenuSnapshot,
    );
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

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

    useEffect(() => {
        if (!snapshot.visible) return;
        // Capture phase so we run before any stopPropagation downstream
        // (e.g. clicks inside popup windows that swallow bubble events).
        // Skip when the click is inside the menu itself so item buttons
        // get to run their onClick first.
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

    const columns = snapshot.options?.columns ?? 0;
    const classes = ['context-menu', 'show'];
    if (columns > 1) classes.push(`context-menu--columns-${columns}`);

    const header = snapshot.options?.header;
    const itemNodes = snapshot.items.map((item, i) => <Item key={i} item={item} />);

    return createPortal(
        <div
            ref={menuRef}
            id="context-menu"
            className={classes.join(' ')}
            style={{
                left: pos?.x ?? snapshot.x,
                top: pos?.y ?? snapshot.y,
                visibility: pos ? 'visible' : 'hidden',
            }}
        >
            {header && (
                <div
                    className={
                        snapshot.options?.smallHeader
                            ? 'context-menu-header context-menu-header-small'
                            : 'context-menu-header'
                    }
                >
                    {header}
                </div>
            )}
            {columns > 1 ? <div className="context-menu-buttons">{itemNodes}</div> : itemNodes}
        </div>,
        document.body,
    );
}
