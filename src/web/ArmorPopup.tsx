import React, { useCallback, useState } from 'react';
import { BicepsFlexed, Footprints, Hand, HardHat, PersonStanding, Shield, Shirt, type LucideIcon } from 'lucide-react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupData } from './hooks/usePopupData';
import { getWornArmor, type WornArmor } from '@client/scripts/armor';

const POPUP_ID = 'popup:armor';

type Slot = 'glowa' | 'korpus' | 'lewe ramie' | 'prawe ramie' | 'dlonie' | 'nogi' | 'stopy' | 'tarcza';

/**
 * Each slot: its name, icon, and where its card sits around the figure. The
 * figure faces the viewer: its right arm is on the left of the window.
 */
const SLOTS: { slot: Slot; label: string; icon: LucideIcon; side: 'left' | 'right'; row: number }[] = [
    { slot: 'glowa', label: 'Głowa', icon: HardHat, side: 'right', row: 1 },
    { slot: 'prawe ramie', label: 'Prawe ramię', icon: BicepsFlexed, side: 'left', row: 2 },
    { slot: 'lewe ramie', label: 'Lewe ramię', icon: BicepsFlexed, side: 'right', row: 2 },
    { slot: 'dlonie', label: 'Dłonie', icon: Hand, side: 'left', row: 3 },
    { slot: 'korpus', label: 'Korpus', icon: Shirt, side: 'right', row: 3 },
    { slot: 'nogi', label: 'Nogi', icon: PersonStanding, side: 'left', row: 4 },
    { slot: 'tarcza', label: 'Tarcza', icon: Shield, side: 'right', row: 4 },
    { slot: 'stopy', label: 'Stopy', icon: Footprints, side: 'left', row: 5 },
];

/** The body: a part lights up when its slot is covered, and stronger while its card is pointed at */
function Figure({ covered, hovered }: { covered: Set<string>; hovered: Slot | null }) {
    const part = (slot: Slot) =>
        `armor-popup__part${covered.has(slot) ? ' armor-popup__part--covered' : ''}${hovered === slot ? ' armor-popup__part--hovered' : ''}`;
    return (
        <svg className="armor-popup__figure" viewBox="0 0 120 280">
            <circle className={part('glowa')} cx="60" cy="26" r="18" />
            <rect className={part('korpus')} x="36" y="48" width="48" height="86" rx="10" />
            {/* Its right arm on the viewer's left */}
            <rect className={part('prawe ramie')} x="14" y="52" width="18" height="74" rx="9" />
            <rect className={part('lewe ramie')} x="88" y="52" width="18" height="74" rx="9" />
            <circle className={part('dlonie')} cx="23" cy="136" r="8" />
            <circle className={part('dlonie')} cx="97" cy="136" r="8" />
            <rect className={part('nogi')} x="38" y="138" width="20" height="108" rx="9" />
            <rect className={part('nogi')} x="62" y="138" width="20" height="108" rx="9" />
            <ellipse className={part('stopy')} cx="45" cy="258" rx="13" ry="7" />
            <ellipse className={part('stopy')} cx="75" cy="258" rx="13" ry="7" />
            {/* On the left arm: drawn over it, so it shows whether the arm is covered or not */}
            <path className={part('tarcza')} d="M92 76 h24 v18 c0 14 -8 22 -12 25 c-4 -3 -12 -11 -12 -25 z" />
        </svg>
    );
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
    const covered = new Set(Object.keys(armor.slots));

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="armor"
            title="Zbroja"
            minWidth={320}
            minHeight={340}
            initialWidth={400}
            initialHeight={440}
            className="armor-popup"
            bodyClassName="popup-body"
        >
            <div className="armor-popup__content">
                <div className="armor-popup__doll">
                    <div className="armor-popup__body">
                        <Figure covered={covered} hovered={hovered} />
                    </div>
                    {SLOTS.map(({ slot, label, icon: Icon, side, row }) => {
                        const item = armor.slots[slot];
                        // A piece over several slots shows on each: say which others
                        const alsoOn = item
                            ? SLOTS.filter(other => other.slot !== slot && armor.slots[other.slot] === item).map(other => other.label)
                            : [];
                        return (
                            <div
                                key={slot}
                                className={`armor-popup__slot armor-popup__slot--${side}${item ? ' armor-popup__slot--filled' : ''}`}
                                style={{ gridRow: row }}
                                onMouseEnter={() => setHovered(slot)}
                                onMouseLeave={() => setHovered(null)}
                                title={item ? [item, alsoOn.length ? `Także: ${alsoOn.join(', ')}` : ''].filter(Boolean).join('\n') : undefined}
                            >
                                <span className="armor-popup__slot-icon"><Icon size={14} /></span>
                                <span className="armor-popup__slot-text">
                                    <span className="armor-popup__slot-label">{label}</span>
                                    <span className="armor-popup__slot-item">{item ?? 'pusto'}</span>
                                </span>
                            </div>
                        );
                    })}
                </div>
                {(armor.unplaced.length > 0 || armor.unknownLines.length > 0) && (
                    <div className="armor-popup__todo">
                        <div className="armor-popup__todo-title">Do uzupełnienia (z ostatniego <code>i</code>)</div>
                        {armor.unplaced.length > 0 && (
                            <>
                                <div className="armor-popup__todo-hint">
                                    Noszone, ale bez miejsca: uzupełnij w złomie osłonę albo nazwę, pod jaką podaje je <code>i</code>.
                                </div>
                                <ul className="armor-popup__todo-list armor-popup__todo-list--unplaced">
                                    {armor.unplaced.map((name, i) => <li key={i}>{name}</li>)}
                                </ul>
                            </>
                        )}
                        {armor.unknownLines.length > 0 && (
                            <>
                                <div className="armor-popup__todo-hint">
                                    Linie, których klient nie rozpoznaje: dla zbroi wpisz w złomie, jak ją opisuje <code>i</code>.
                                </div>
                                <ul className="armor-popup__todo-list armor-popup__todo-list--lines">
                                    {armor.unknownLines.map((line, i) => <li key={i}>{line}</li>)}
                                </ul>
                            </>
                        )}
                    </div>
                )}
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
