import { useState, useEffect } from 'react';
import { useClientEvent } from '@web-ui/hooks';
import eventBus from '@modules/core/eventBus';
import { getBuiltInPanelSetting } from '../utils/layoutStorage';

const PANEL_ID = 'objectList';

export function ObjectListTimersBar() {
    // Toggle visibility settings — initialized from storage, synced via eventBus
    const [showWeapon, setShowWeapon] = useState(() => getBuiltInPanelSetting(PANEL_ID, 'showWeaponState', false));
    const [showCover, setShowCover] = useState(() => getBuiltInPanelSetting(PANEL_ID, 'showCoverTimer', false));
    const [showOrder, setShowOrder] = useState(() => getBuiltInPanelSetting(PANEL_ID, 'showOrderTimer', false));
    const [showZask, setShowZask] = useState(() => getBuiltInPanelSetting(PANEL_ID, 'showZaskTimer', false));

    useEffect(() => {
        const onWeapon = (v: unknown) => setShowWeapon(v as boolean);
        const onCover = (v: unknown) => setShowCover(v as boolean);
        const onOrder = (v: unknown) => setShowOrder(v as boolean);
        const onZask = (v: unknown) => setShowZask(v as boolean);
        eventBus.on('objectList.showWeaponState', onWeapon);
        eventBus.on('objectList.showCoverTimer', onCover);
        eventBus.on('objectList.showOrderTimer', onOrder);
        eventBus.on('objectList.showZaskTimer', onZask);
        return () => {
            eventBus.off('objectList.showWeaponState', onWeapon);
            eventBus.off('objectList.showCoverTimer', onCover);
            eventBus.off('objectList.showOrderTimer', onOrder);
            eventBus.off('objectList.showZaskTimer', onZask);
        };
    }, []);

    // Client state
    const [hasWeapon, setHasWeapon] = useState<boolean | null>(null);
    const [coverSeconds, setCoverSeconds] = useState<number | null>(null);
    const [orderSeconds, setOrderSeconds] = useState<number | null>(null);
    const [isLeader, setIsLeader] = useState(false);
    const [zaskPayload, setZaskPayload] = useState<{ seconds: number; ok: boolean } | null>(null);

    useClientEvent<boolean>('weapon_state', setHasWeapon);
    useClientEvent<number | null>('coverTimer', setCoverSeconds);
    useClientEvent<number | null>('orderTimer', setOrderSeconds);
    useClientEvent<boolean>('isTeamLeader', (flag) => setIsLeader(Boolean(flag)));
    useClientEvent<{ seconds: number; ok: boolean } | null>('zaskTimer', setZaskPayload);

    const coverActive = coverSeconds != null && coverSeconds > 0;
    const orderActive = orderSeconds != null && orderSeconds > 0;

    // Determine which items to show
    const showWeaponItem = showWeapon;
    const showCoverItem = showCover;
    const showOrderItem = showOrder && isLeader;
    const showZaskItem = showZask;

    if (!showWeaponItem && !showCoverItem && !showOrderItem && !showZaskItem) return null;

    return (
        <div className="object-list-timers-bar">
            {showWeaponItem && (
                <span className="object-list-timers-bar__item">
                    Bron: <span className={hasWeapon === null ? 'object-list-timers-bar__value--off' : hasWeapon ? 'object-list-timers-bar__value--on' : 'object-list-timers-bar__value--off'}>{hasWeapon === null ? '--' : hasWeapon ? 'on' : 'off'}</span>
                </span>
            )}
            {showCoverItem && (
                <span className="object-list-timers-bar__item">
                    Zas: <span className={coverActive ? 'object-list-timers-bar__item--active' : 'object-list-timers-bar__item--ready'}>{coverActive ? coverSeconds.toFixed(2) : 'OK'}</span>
                </span>
            )}
            {showOrderItem && (
                <span className="object-list-timers-bar__item">
                    Rozkaz: <span className={orderActive ? 'object-list-timers-bar__item--active' : 'object-list-timers-bar__item--ready'}>{orderActive ? orderSeconds.toFixed(2) : 'OK'}</span>
                </span>
            )}
            {showZaskItem && (
                <span className="object-list-timers-bar__item">
                    Zask: <span className={!zaskPayload ? 'object-list-timers-bar__value--off' : zaskPayload.ok ? 'object-list-timers-bar__item--ready' : zaskPayload.seconds >= 20 ? 'object-list-timers-bar__item--active' : 'object-list-timers-bar__item--danger'}>{!zaskPayload ? '--' : zaskPayload.ok ? 'OK' : zaskPayload.seconds}</span>
                </span>
            )}
        </div>
    );
}
