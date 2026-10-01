import { Button, Icon, Menu, MenuCheckItem } from "../ui";

export interface ViewMenuProps {
    showTimestamps: boolean;
    onShowTimestampsChange: (value: boolean) => void;
    showMeta: boolean;
    onShowMetaChange: (value: boolean) => void;
    showColors: boolean;
    onShowColorsChange: (value: boolean) => void;
    /** Only offered when the session actually stores the game's colours. */
    colorsAvailable: boolean;
    wrap: boolean;
    onWrapChange: (value: boolean) => void;
}

/**
 * How the log is drawn, in one menu.
 *
 * These four were switches in the status bar, always on screen though they are
 * set once and forgotten. They are remembered between sessions, so a menu is
 * where they belong.
 */
export function ViewMenu({
    showTimestamps,
    onShowTimestampsChange,
    showMeta,
    onShowMetaChange,
    showColors,
    onShowColorsChange,
    colorsAvailable,
    wrap,
    onWrapChange,
}: ViewMenuProps) {
    return (
        <Menu
            align="end"
            trigger={
                <Button
                    size="sm"
                    icon={<Icon name="view" size={14} />}
                    trailing={<Icon name="chevron-down" size={14} />}
                    title="Jak pokazywać log"
                >
                    Widok
                </Button>
            }
        >
            <MenuCheckItem checked={showTimestamps} label="Godziny" onToggle={() => onShowTimestampsChange(!showTimestamps)} />
            <MenuCheckItem checked={showMeta} label="Numer i typ linii" onToggle={() => onShowMetaChange(!showMeta)} />
            {colorsAvailable ? (
                <MenuCheckItem
                    checked={showColors}
                    label="Kolory z gry"
                    title="Wyłącza podświetlanie trafień w linii"
                    onToggle={() => onShowColorsChange(!showColors)}
                />
            ) : null}
            <MenuCheckItem checked={wrap} label="Zawijaj długie linie" onToggle={() => onWrapChange(!wrap)} />
        </Menu>
    );
}
