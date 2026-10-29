import React, { useCallback } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { usePopupSetting } from './hooks/usePopupSetting';
import { Segmented } from '@web-ui/primitives';
import { setActiveDomain, type Domain } from './worldClockStore';
import { WorldTimeClocks, type WorldTimeView } from './WorldTimeView';

const POPUP_ID = 'popup:worldTime';

const VIEW_OPTIONS: { value: WorldTimeView; label: string }[] = [
    { value: 'current', label: 'Bieżąca' },
    { value: 'other', label: 'Druga' },
    { value: 'both', label: 'Obie' },
];

/**
 * "Czas" — the in-game season / world-date / time-of-day window, as a dockable
 * popup. The clocks themselves are
 * WorldTimeClocks, which the clock widget shows too.
 *
 * The header switch picks what to show relative to where you stand — the
 * current domain, the other one, or both stacked. The choice is a window setting.
 * Setting a domain's clock by hand is the /czas imperium|ishtar alias.
 * Opened by /czas (or /czasw), the footer clock chip and the window menu.
 */
const WorldTimePopup: React.FC = () => {
    const [view, setView] = usePopupSetting<WorldTimeView>(POPUP_ID, 'view', 'current');
    // The openers pass the active domain — covers a window opened before the
    // first clock.domain.active.
    const onOpen = useCallback((data?: { domain?: Domain }) => {
        if (data?.domain) setActiveDomain(data.domain);
    }, []);
    const { wrapperProps } = usePopup(POPUP_ID, { openEvent: 'clock.popup.open', onOpen });

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="worldTime"
            title="Czas"
            minWidth={190}
            initialWidth={240}
            bodyClassName="world-time-popup"
            headerActions={
                <div className="wt-domain-switch">
                    <Segmented size="sm" value={view} options={VIEW_OPTIONS} onChange={setView} />
                </div>
            }
        >
            <WorldTimeClocks view={view} />
        </DockablePopupWrapper>
    );
};

export default WorldTimePopup;
