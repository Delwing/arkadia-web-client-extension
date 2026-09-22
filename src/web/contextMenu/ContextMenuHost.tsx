import {
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check } from 'lucide-react';
import {
    getContextMenuSnapshot,
    hideContextMenu,
    subscribeContextMenu,
    type ContextMenuEntry,
} from './contextMenuStore';
import { groupEntries } from './contextMenuBlocks';

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

/**
 * Runs an entry, then closes the menu and hands the keyboard back to the
 * command line - unless the entry opened a window, which focuses its own
 * field. The action goes first so Safari's transient user activation
 * (clipboard.write etc.) isn't invalidated by the unmount.
 */
function run(action: () => void, opensWindow?: boolean) {
    action();
    hideContextMenu();
    if (opensWindow) return;
    const input = document.getElementById('message-input') as HTMLTextAreaElement | null;
    if (input) {
        input.focus();
        input.select();
    }
}

function EntryIcon({ item }: { item: ContextMenuEntry }) {
    if (item.checked !== undefined) {
        return (
            <span className="context-menu__icon context-menu__icon--check">
                {item.checked ? <Check size={15} strokeWidth={2.4} /> : null}
            </span>
        );
    }
    const Icon = item.icon;
    return <span className="context-menu__icon">{Icon ? <Icon size={15} /> : null}</span>;
}

function Row({ item, withIcons }: { item: ContextMenuEntry; withIcons: boolean }) {
    const classes = ['context-menu__item'];
    if (item.opensWindow) classes.push('opens-window');
    if (item.tone === 'danger') classes.push('context-menu__item--danger');
    const text = (
        <span className="context-menu__text">
            <span className="context-menu__label">{renderLabel(item.label)}</span>
            {item.detail ? <span className="context-menu__detail">{item.detail}</span> : null}
        </span>
    );

    if (item.choices) {
        classes.push('context-menu__item--choices');
        return (
            <div className={classes.join(' ')}>
                {withIcons && <EntryIcon item={item} />}
                {text}
                <span className="context-menu__choices">
                    {item.choices.map((choice) => (
                        <button
                            key={choice.label}
                            type="button"
                            className="context-menu__choice"
                            title={choice.title}
                            onClick={() => run(choice.action)}
                        >
                            {choice.label}
                        </button>
                    ))}
                </span>
            </div>
        );
    }

    return (
        <button type="button" className={classes.join(' ')} onClick={() => run(item.action, item.opensWindow)}>
            {withIcons && <EntryIcon item={item} />}
            {text}
            {item.hint ? <span className="context-menu__hint">{item.hint}</span> : null}
            {item.opensWindow ? (
                <span className="context-menu__opens">
                    <ArrowUpRight size={13} />
                </span>
            ) : null}
        </button>
    );
}

function Tile({ item }: { item: ContextMenuEntry }) {
    const Icon = item.icon;
    const classes = ['context-menu__tile'];
    if (item.variant === 'quick') classes.push('context-menu__quick');
    if (item.active) classes.push('is-active');
    return (
        <button type="button" className={classes.join(' ')} onClick={() => run(item.action, item.opensWindow)}>
            {Icon ? <Icon size={18} /> : null}
            <span className="context-menu__tile-label">{renderLabel(item.label)}</span>
            {item.variant === 'tile' && item.active ? <span className="context-menu__open-dot" /> : null}
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
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') hideContextMenu();
        };
        document.addEventListener('click', onDocumentEvent, true);
        document.addEventListener('contextmenu', onDocumentEvent, true);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('click', onDocumentEvent, true);
            document.removeEventListener('contextmenu', onDocumentEvent, true);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [snapshot.visible]);

    if (!snapshot.visible) return null;

    const options = snapshot.options;
    const columns = options?.columns ?? 0;
    const classes = ['context-menu', 'show'];
    if (columns > 1) classes.push(`context-menu--columns-${columns}`);

    // Rows keep a shared icon column only when some row has an icon to put there.
    const withIcons = snapshot.items.some((item) => item.icon !== undefined || item.checked !== undefined);

    const blocks = groupEntries(snapshot.items).map((block, i) => {
        const body =
            block.variant === 'tile' || block.variant === 'quick' ? (
                <div className={block.variant === 'tile' ? 'context-menu__tiles' : 'context-menu__quicks'}>
                    {block.items.map((item, j) => (
                        <Tile key={j} item={item} />
                    ))}
                </div>
            ) : columns > 1 ? (
                <div className="context-menu-buttons">
                    {block.items.map((item, j) => (
                        <Row key={j} item={item} withIcons={withIcons} />
                    ))}
                </div>
            ) : (
                block.items.map((item, j) => <Row key={j} item={item} withIcons={withIcons} />)
            );
        return (
            <div key={i} className="context-menu__block" data-section={block.section}>
                {block.separatorBefore && <div className="context-menu__separator" />}
                {block.caption && <div className="context-menu__caption">{block.caption}</div>}
                {body}
            </div>
        );
    });

    return createPortal(
        <div
            ref={menuRef}
            id="context-menu"
            className={classes.join(' ')}
            style={{
                left: pos?.x ?? snapshot.x,
                top: pos?.y ?? snapshot.y,
                width: options?.width,
                visibility: pos ? 'visible' : 'hidden',
            }}
        >
            {options?.header && (
                <div
                    className={
                        options.smallHeader
                            ? 'context-menu-header context-menu-header-small'
                            : 'context-menu-header'
                    }
                >
                    <span className="context-menu-header__name">{options.header}</span>
                    {options.headerMeta && <span className="context-menu-header__meta">{options.headerMeta}</span>}
                </div>
            )}
            {blocks}
        </div>,
        document.body,
    );
}
