import { useState, useCallback, useEffect, useRef } from 'react';
import eventBus from '@modules/core/eventBus';
import { useBuiltInPanelSetting } from '../../hooks/useBuiltInPanelSetting';

const PANEL_ID = 'objectList';

export function ObjectListHeaderMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);

    const [showWeaponState, setShowWeaponState] = useBuiltInPanelSetting(PANEL_ID, 'showWeaponState', false);
    const [showCoverTimer, setShowCoverTimer] = useBuiltInPanelSetting(PANEL_ID, 'showCoverTimer', false);
    const [showOrderTimer, setShowOrderTimer] = useBuiltInPanelSetting(PANEL_ID, 'showOrderTimer', false);
    const [showZaskTimer, setShowZaskTimer] = useBuiltInPanelSetting(PANEL_ID, 'showZaskTimer', false);

    // Emit settings on mount and when they change
    useEffect(() => { eventBus.emit('objectList.showWeaponState', showWeaponState); }, [showWeaponState]);
    useEffect(() => { eventBus.emit('objectList.showCoverTimer', showCoverTimer); }, [showCoverTimer]);
    useEffect(() => { eventBus.emit('objectList.showOrderTimer', showOrderTimer); }, [showOrderTimer]);
    useEffect(() => { eventBus.emit('objectList.showZaskTimer', showZaskTimer); }, [showZaskTimer]);

    const calculateDropdownPosition = useCallback(() => {
        if (toggleRef.current) {
            const rect = toggleRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const availableSpace = viewportHeight - rect.bottom - 16;
            const maxHeight = Math.max(100, Math.min(360, availableSpace));
            setDropdownStyle({
                position: 'fixed',
                top: rect.bottom + 4,
                right: window.innerWidth - rect.right,
                maxHeight,
            });
        }
    }, []);

    const toggleMenu = useCallback(() => {
        setIsOpen(prev => {
            if (!prev) calculateDropdownPosition();
            return !prev;
        });
    }, [calculateDropdownPosition]);

    const closeMenu = useCallback(() => { setIsOpen(false); }, []);

    // Close on outside click or Escape
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (event: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                closeMenu();
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeMenu();
        };

        window.addEventListener('pointerdown', handleClickOutside);
        window.addEventListener('keydown', handleEscape);

        return () => {
            window.removeEventListener('pointerdown', handleClickOutside);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, closeMenu]);

    const handleToggleWeaponState = useCallback(() => {
        setShowWeaponState(prev => !prev);
        closeMenu();
    }, [setShowWeaponState, closeMenu]);

    const handleToggleCoverTimer = useCallback(() => {
        setShowCoverTimer(prev => !prev);
        closeMenu();
    }, [setShowCoverTimer, closeMenu]);

    const handleToggleOrderTimer = useCallback(() => {
        setShowOrderTimer(prev => !prev);
        closeMenu();
    }, [setShowOrderTimer, closeMenu]);

    const handleToggleZaskTimer = useCallback(() => {
        setShowZaskTimer(prev => !prev);
        closeMenu();
    }, [setShowZaskTimer, closeMenu]);

    return (
        <div ref={menuRef} className="map-header-menu">
            <button
                ref={toggleRef}
                type="button"
                className="map-header-menu__toggle"
                onClick={toggleMenu}
                title="Ustawienia listy"
            >
                <span className="map-header-menu__hamburger" />
            </button>
            {isOpen && (
                <div className="map-header-menu__dropdown" style={dropdownStyle ?? undefined}>
                    <button
                        type="button"
                        className="map-header-menu__item map-header-menu__item--checkbox"
                        onClick={handleToggleWeaponState}
                    >
                        <span className={`map-header-menu__checkbox${showWeaponState ? ' map-header-menu__checkbox--checked' : ''}`} />
                        Stan broni
                    </button>
                    <button
                        type="button"
                        className="map-header-menu__item map-header-menu__item--checkbox"
                        onClick={handleToggleCoverTimer}
                    >
                        <span className={`map-header-menu__checkbox${showCoverTimer ? ' map-header-menu__checkbox--checked' : ''}`} />
                        Timer zaslony
                    </button>
                    <button
                        type="button"
                        className="map-header-menu__item map-header-menu__item--checkbox"
                        onClick={handleToggleOrderTimer}
                    >
                        <span className={`map-header-menu__checkbox${showOrderTimer ? ' map-header-menu__checkbox--checked' : ''}`} />
                        Timer rozkazu
                    </button>
                    <button
                        type="button"
                        className="map-header-menu__item map-header-menu__item--checkbox"
                        onClick={handleToggleZaskTimer}
                    >
                        <span className={`map-header-menu__checkbox${showZaskTimer ? ' map-header-menu__checkbox--checked' : ''}`} />
                        Timer zaskoku
                    </button>
                </div>
            )}
        </div>
    );
}
