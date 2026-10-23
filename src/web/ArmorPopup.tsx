import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight, EyeOff, Undo2 } from 'lucide-react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupData } from './hooks/usePopupData';
import { getWornArmor, ignoreTodo, unignoreTodo, type WornArmor } from '@client/scripts/armor';
import ArmorILinePicker, { type ILineSubject } from './ArmorILinePicker';
import ArmorOdmianaHint from './ArmorOdmianaHint';

const POPUP_ID = 'popup:armor';

const EXTRA_KINDS = { ubrania: 'Ubranie', dodatki: 'Dodatek' } as const;

/** One state for all of them: a guild or club item is just one more thing to leave alone */
const IGNORE_TITLE = 'Ignoruj (np. przedmiot gildiowy lub klubowy): nie pokazuj go tu więcej';

/** Leaves a piece or line of "Do uzupełnienia" alone for good */
const IgnoreButton: React.FC<{ text: string }> = ({ text }) => (
    <button
        type="button"
        className="armor-popup__todo-ignore"
        title={IGNORE_TITLE}
        // Not a click on the line: that would pick it for the złom list
        onMouseUp={e => e.stopPropagation()}
        onClick={() => ignoreTodo(text)}
    >
        <EyeOff size={12} />
    </button>
);

type Slot = 'glowa' | 'korpus' | 'lewe ramie' | 'prawe ramie' | 'dlonie' | 'nogi' | 'stopy' | 'tarcza';

/**
 * Each slot: its name, the column its card sits in, and where its line meets
 * the figure (in the figure's 200x420 drawing). The figure faces the viewer:
 * its right arm is on the left of the window.
 */
const SLOTS: { slot: Slot; label: string; side: 'left' | 'right'; x: number; y: number }[] = [
    { slot: 'glowa', label: 'Głowa', side: 'left', x: 86, y: 30 },
    { slot: 'prawe ramie', label: 'Prawe ramię', side: 'left', x: 49, y: 120 },
    { slot: 'dlonie', label: 'Dłonie', side: 'left', x: 37, y: 232 },
    { slot: 'nogi', label: 'Nogi', side: 'left', x: 80, y: 290 },
    { slot: 'lewe ramie', label: 'Lewe ramię', side: 'right', x: 151, y: 112 },
    { slot: 'korpus', label: 'Korpus', side: 'right', x: 116, y: 140 },
    { slot: 'tarcza', label: 'Tarcza', side: 'right', x: 172, y: 194 },
    { slot: 'stopy', label: 'Stopy', side: 'right', x: 124, y: 400 },
];

/** The figure's right half; the left is the same, mirrored */
const HALF = 'M100 8 C88 8 79 17 79 32 C79 43 82 52 87 58 C89 61 91 63 91 66 L91 74 C86 78 76 80 66 82 C56 84 49 89 47 98 '
    + 'C45 106 44 116 43 126 C41 140 38 156 36 170 C34 186 31 202 30 214 C29 222 28 230 30 238 C32 246 40 248 43 242 '
    + 'C45 236 44 226 44 218 C45 206 48 192 50 178 C52 166 54 152 56 140 C58 132 60 128 62 126 C63 140 64 156 66 170 '
    + 'C67 182 66 192 65 200 C64 210 63 222 63 232 C62 250 63 270 65 290 C66 304 67 316 68 326 C67 340 66 356 68 372 '
    + 'C69 380 70 386 70 392 C66 396 60 400 60 404 L60 408 L94 408 L94 396 C94 384 95 372 95 360 C95 346 94 334 95 324 '
    + 'C96 300 98 276 99 256 L100 248 Z';
/** Collarbone, ribs, belt and knee */
const DETAIL = 'M100 88 C92 90 80 90 70 87 M66 168 C80 175 92 177 100 177 M64 202 C80 207 92 209 100 209 '
    + 'M71 318 C77 326 87 326 93 318 M58 132 C54 150 50 165 47 176';
const MIRROR = 'matrix(-1 0 0 1 200 0)';

/** Each slot's band of the figure, cut to its outline */
const PARTS: { slot: Slot; x: number; y: number; width: number; height: number }[] = [
    { slot: 'glowa', x: 70, y: 0, width: 60, height: 70 },
    { slot: 'korpus', x: 60, y: 70, width: 80, height: 165 },
    { slot: 'prawe ramie', x: 20, y: 78, width: 40, height: 128 },
    { slot: 'lewe ramie', x: 140, y: 78, width: 40, height: 128 },
    { slot: 'dlonie', x: 20, y: 206, width: 40, height: 50 },
    { slot: 'dlonie', x: 140, y: 206, width: 40, height: 50 },
    { slot: 'nogi', x: 55, y: 235, width: 90, height: 153 },
    { slot: 'stopy', x: 55, y: 388, width: 90, height: 24 },
];

/** The body: a part lights up when its slot is covered, and stronger while the piece on it is pointed at */
const Figure = React.forwardRef<SVGSVGElement, { covered: Set<string>; lit: Set<string> }>(({ covered, lit }, ref) => {
    const id = useId().replace(/:/g, '');
    const part = (slot: Slot) =>
        `armor-popup__part${covered.has(slot) ? ' armor-popup__part--covered' : ''}${lit.has(slot) ? ' armor-popup__part--lit' : ''}`;
    return (
        <svg ref={ref} className="armor-popup__figure" viewBox="0 0 200 420">
            <defs>
                <path id={`${id}-half`} d={HALF} />
                {/* Both halves, and a strip down the middle so no hairline shows where they meet */}
                <clipPath id={`${id}-body`}>
                    <use href={`#${id}-half`} />
                    <use href={`#${id}-half`} transform={MIRROR} />
                    <rect x="98" y="10" width="4" height="236" />
                </clipPath>
                {/* Everything but the body: the outline shows only outside it, as the skin is see-through */}
                <mask id={`${id}-outside`} maskUnits="userSpaceOnUse" x="-10" y="-10" width="220" height="440">
                    <rect x="-10" y="-10" width="220" height="440" fill="white" />
                    <g clipPath={`url(#${id}-body)`}>
                        <rect x="0" y="0" width="200" height="420" fill="black" />
                    </g>
                </mask>
            </defs>
            <g mask={`url(#${id}-outside)`}>
                <use className="armor-popup__outline" href={`#${id}-half`} />
                <use className="armor-popup__outline" href={`#${id}-half`} transform={MIRROR} />
            </g>
            <g clipPath={`url(#${id}-body)`}>
                <rect className="armor-popup__skin" x="0" y="0" width="200" height="420" />
                {PARTS.map(({ slot, ...rect }, i) => <rect key={i} className={part(slot)} {...rect} />)}
                <path className="armor-popup__detail" d={DETAIL} />
                <path className="armor-popup__detail" d={DETAIL} transform={MIRROR} />
            </g>
            {/* On the left forearm: drawn over it, so it shows whether the arm is covered or not */}
            <path className={`${part('tarcza')} armor-popup__shield`} d="M150 166 h32 v22 c0 20 -9 30 -16 34 c-7 -4 -16 -14 -16 -34 z" />
        </svg>
    );
});

interface Line { slot: Slot; points: string; x: number; y: number }

/**
 * A line from each card to its part. Cards grow with the names on them, so
 * where they end up is measured, again whenever the window resizes.
 */
function useLines(doll: React.RefObject<HTMLDivElement | null>, figure: React.RefObject<SVGSVGElement | null>,
    cards: React.RefObject<Partial<Record<Slot, HTMLDivElement | null>>>, armor: WornArmor) {
    const [lines, setLines] = useState<Line[]>([]);
    useLayoutEffect(() => {
        const root = doll.current;
        if (!root) return;
        const measure = () => {
            const fig = figure.current;
            if (!fig || !root.offsetWidth) return;
            const base = root.getBoundingClientRect();
            // Undo any zoom the window sits under
            const zoom = base.width / root.offsetWidth || 1;
            const rel = (el: Element) => {
                const b = el.getBoundingClientRect();
                return { x: (b.left - base.left) / zoom, y: (b.top - base.top) / zoom, w: b.width / zoom, h: b.height / zoom };
            };
            const f = rel(fig);
            const scale = f.w / 200;
            const next = SLOTS.flatMap(({ slot, side, x, y }) => {
                const card = cards.current[slot];
                if (!card) return [];
                const c = rel(card);
                const ax = f.x + x * scale;
                const ay = f.y + y * scale;
                const ex = side === 'left' ? c.x + c.w : c.x;
                const ey = c.y + Math.min(16, c.h / 2);
                const elbow = side === 'left' ? ex + 10 : ex - 10;
                return [{ slot, points: `${ex},${ey} ${elbow},${ey} ${ax},${ay}`, x: ax, y: ay }];
            });
            setLines(prev => JSON.stringify(prev) === JSON.stringify(next) ? prev : next);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(root);
        return () => observer.disconnect();
    }, [doll, figure, cards, armor]);
    return lines;
}

const ArmorPopup: React.FC = () => {
    const { wrapperProps, isOpen } = usePopup<'armor.popup.open'>(POPUP_ID, {
        openEvent: 'armor.popup.open',
    });

    const { data: armor } = usePopupData<WornArmor>(isOpen, {
        getInitialData: useCallback(() => getWornArmor(), []),
        updateEvent: 'armor.updated',
        transformUpdate: useCallback(() => getWornArmor(), []),
    });

    const [hovered, setHovered] = useState<Slot | null>(null);
    // The unrecognised line, or unplaced piece, being given to a złom entry
    const [picking, setPicking] = useState<ILineSubject | null>(null);
    // Placed or gone with a newer reply: nothing left to pick from
    const subject = picking && (picking.type === 'line'
        ? armor.unknownLines.includes(picking.line)
        : armor.unplaced.includes(picking.name)) ? picking : null;

    /** The text selected inside this line, or the whole line when nothing is */
    const pickFrom = (line: string, element: HTMLElement) => {
        // The element's own document: popped out, the window runs this code in the opener's realm
        const selection = element.ownerDocument.getSelection();
        const selected = selection && !selection.isCollapsed && element.contains(selection.anchorNode) && element.contains(selection.focusNode)
            ? selection.toString().trim()
            : '';
        setPicking({ type: 'line', line, fragment: selected || line });
    };
    const covered = new Set(Object.keys(armor.slots));
    // A piece over several slots lights up all of them
    const hoveredItem = hovered ? armor.slots[hovered] : undefined;
    const lit = new Set<string>(hoveredItem
        ? SLOTS.filter(({ slot }) => armor.slots[slot] === hoveredItem).map(({ slot }) => slot)
        : hovered ? [hovered] : []);

    const doll = useRef<HTMLDivElement>(null);
    const figure = useRef<SVGSVGElement>(null);
    const cards = useRef<Partial<Record<Slot, HTMLDivElement | null>>>({});
    const lines = useLines(doll, figure, cards, armor);

    // Listed under the doll, so it can turn up out of sight: bring it in when it appears
    const todo = useRef<HTMLDivElement>(null);
    const hasTodo = armor.unplaced.length > 0 || armor.unknownLines.length > 0;
    useEffect(() => {
        if (hasTodo && isOpen) todo.current?.scrollIntoView({ block: 'nearest' });
    }, [hasTodo, isOpen]);

    const column = (side: 'left' | 'right') => (
        <div className={`armor-popup__column armor-popup__column--${side}`}>
            {SLOTS.filter(entry => entry.side === side).map(({ slot, label }) => {
                const item = armor.slots[slot];
                return (
                    <div
                        key={slot}
                        ref={el => { cards.current[slot] = el; }}
                        className={`armor-popup__slot${item ? ' armor-popup__slot--filled' : ''}${lit.has(slot) ? ' armor-popup__slot--lit' : ''}`}
                        onMouseEnter={() => setHovered(slot)}
                        onMouseLeave={() => setHovered(null)}
                    >
                        <span className="armor-popup__slot-label">{label}</span>
                        <span className="armor-popup__slot-item">{item ?? 'pusto'}</span>
                    </div>
                );
            })}
        </div>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="armor"
            title="Zbroja"
            minWidth={360}
            minHeight={380}
            initialWidth={480}
            initialHeight={520}
            className="armor-popup"
            bodyClassName="popup-body"
        >
            <div className="armor-popup__content">
                <div className="armor-popup__doll" ref={doll}>
                    {column('left')}
                    <div className="armor-popup__body">
                        <Figure ref={figure} covered={covered} lit={lit} />
                    </div>
                    {column('right')}
                    <svg className="armor-popup__lines">
                        {lines.map(({ slot, points, x, y }) => {
                            const cls = `armor-popup__line${covered.has(slot) ? ' armor-popup__line--covered' : ''}${lit.has(slot) ? ' armor-popup__line--lit' : ''}`;
                            return (
                                <g key={slot} className={cls}>
                                    <polyline points={points} />
                                    <circle cx={x} cy={y} r={3} />
                                </g>
                            );
                        })}
                    </svg>
                </div>
                {armor.extras.length > 0 && (
                    <div className="armor-popup__extras">
                        {armor.extras.map(({ name, kind, material }) => (
                            <span
                                key={name}
                                className={`popup-badge armor-popup__extra${kind ? ` armor-popup__extra--${kind}` : ''}`}
                                title={kind
                                    ? `${EXTRA_KINDS[kind]}${material ? `, z ${material}` : ''}`
                                    : 'Nie ma go w złomie. Oceń go, żeby wiedzieć, czy to ubranie, czy dodatek.'}
                            >
                                {name}
                            </span>
                        ))}
                    </div>
                )}
                {hasTodo && (
                    <div className="armor-popup__todo" ref={todo}>
                        <div className="armor-popup__todo-title">Do uzupełnienia (z ostatniego <code>i</code>)</div>
                        {armor.unplaced.length > 0 && (
                            <>
                                <div className="armor-popup__todo-hint">
                                    Noszone, ale bez miejsca, bo w złomie występuje pod inną nazwą albo nie ma go wcale. Kliknij, żeby wskazać, który to przedmiot ze złomu.
                                </div>
                                <ul className="armor-popup__todo-list armor-popup__todo-list--unplaced">
                                    {armor.unplaced.map((name, i) => (
                                        <li
                                            key={i}
                                            className={subject?.type === 'piece' && subject.name === name ? 'armor-popup__todo-line--picking' : undefined}
                                        >
                                            <button
                                                type="button"
                                                className="armor-popup__todo-piece"
                                                onClick={() => setPicking({ type: 'piece', name })}
                                            >
                                                <span>{name}</span>
                                                <span className="armor-popup__todo-piece-action">wskaż <ChevronRight size={12} /></span>
                                            </button>
                                            <IgnoreButton text={name} />
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                        {armor.unknownLines.length > 0 && (
                            <>
                                <div className="armor-popup__todo-hint">
                                    Linie, których klient nie rozpoznaje. Jeśli to zbroja, ubranie albo dodatek, zaznacz fragment, który go wyróżnia (albo kliknij całą linię), i wskaż przedmiot ze złomu.
                                </div>
                                <ul className="armor-popup__todo-list armor-popup__todo-list--lines">
                                    {armor.unknownLines.map((line, i) => (
                                        <li
                                            key={i}
                                            className={subject?.type === 'line' && subject.line === line ? 'armor-popup__todo-line--picking' : undefined}
                                            title="Zaznacz fragment albo kliknij całą linię"
                                            onMouseUp={e => pickFrom(line, e.currentTarget)}
                                        >
                                            <span className="armor-popup__todo-line-text">{line}</span>
                                            <IgnoreButton text={line} />
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}
                {armor.ignored.length > 0 && (
                    <details className="armor-popup__ignored">
                        <summary>Ignorowane ({armor.ignored.length})</summary>
                        <ul className="armor-popup__ignored-list">
                            {armor.ignored.map(text => (
                                <li key={text}>
                                    <span className="armor-popup__ignored-text">{text}</span>
                                    <button
                                        type="button"
                                        className="armor-popup__todo-ignore"
                                        title="Przywróć: pokaż w Do uzupełnienia od następnego i"
                                        onClick={() => unignoreTodo(text)}
                                    >
                                        <Undo2 size={12} />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}
                {subject && (
                    <ArmorILinePicker subject={subject} lines={armor.unknownLines} onClose={() => setPicking(null)} />
                )}
                <ArmorOdmianaHint slots={armor.slots} />
                {armor.updatedAt === null && (
                    <div className="armor-popup__hint">
                        Okno uczy się z zakładania i zdejmowania — załóż coś, a pojawi się tutaj.
                    </div>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default ArmorPopup;
