export type UiSettingsPalette = 'arkadia' | 'proper';

export type UiSettingsEventPayload = {
    mobileDirectionButtons?: boolean;
    hapticFeedback?: boolean;
    emojiLabels?: boolean;
    xtermPalette?: UiSettingsPalette;
    footerMode?: number;
    fightTitleIcon?: boolean;
    clearInputOnSend?: boolean;
    showTransportLabel?: boolean;
    showCombatTimer?: boolean;
    showClockDisplay?: boolean;
    autoLowercaseCommands?: boolean;
} & Record<string, unknown>;

