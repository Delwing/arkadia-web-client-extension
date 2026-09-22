import { useEffect } from 'react';
import eventBus from '@modules/core/eventBus';
import { useBuiltInPanelSetting } from '../../hooks/useBuiltInPanelSetting';
import { usePopover } from '../hooks/usePopover';
import { HeaderMenu, MenuCheckItem } from './HeaderMenu';

const PANEL_ID = 'objectList';

export function ObjectListHeaderMenu() {
    const menu = usePopover();
    const [showWeaponState, setShowWeaponState] = useBuiltInPanelSetting(PANEL_ID, 'showWeaponState', false);
    const [showCoverTimer, setShowCoverTimer] = useBuiltInPanelSetting(PANEL_ID, 'showCoverTimer', false);
    const [showOrderTimer, setShowOrderTimer] = useBuiltInPanelSetting(PANEL_ID, 'showOrderTimer', false);
    const [showZaskTimer, setShowZaskTimer] = useBuiltInPanelSetting(PANEL_ID, 'showZaskTimer', false);

    // Emit settings on mount and when they change
    useEffect(() => { eventBus.emit('objectList.showWeaponState', showWeaponState); }, [showWeaponState]);
    useEffect(() => { eventBus.emit('objectList.showCoverTimer', showCoverTimer); }, [showCoverTimer]);
    useEffect(() => { eventBus.emit('objectList.showOrderTimer', showOrderTimer); }, [showOrderTimer]);
    useEffect(() => { eventBus.emit('objectList.showZaskTimer', showZaskTimer); }, [showZaskTimer]);

    const toggle = (set: (fn: (prev: boolean) => boolean) => void) => () => {
        set(prev => !prev);
        menu.close();
    };

    return (
        <HeaderMenu menu={menu} title="Ustawienia listy">
            <MenuCheckItem checked={showWeaponState} onClick={toggle(setShowWeaponState)}>Stan broni</MenuCheckItem>
            <MenuCheckItem checked={showCoverTimer} onClick={toggle(setShowCoverTimer)}>Timer zaslony</MenuCheckItem>
            <MenuCheckItem checked={showOrderTimer} onClick={toggle(setShowOrderTimer)}>Timer rozkazu</MenuCheckItem>
            <MenuCheckItem checked={showZaskTimer} onClick={toggle(setShowZaskTimer)}>Timer zaskoku</MenuCheckItem>
        </HeaderMenu>
    );
}
