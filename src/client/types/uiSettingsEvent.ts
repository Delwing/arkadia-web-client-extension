export type UiSettingsPalette = 'arkadia' | 'proper';

export type UiSettingsEventPayload = {
    mobileDirectionButtons?: boolean;
    hapticFeedback?: boolean;
    emojiLabels?: boolean;
    xtermPalette?: UiSettingsPalette;
    footerMode?: number;
    fightTitleIcon?: boolean;
    clearInputOnSend?: boolean;
    autoLowercaseCommands?: boolean;
    keepMultibindsVisible?: boolean;
    drinkableAsFunctionalBind?: boolean;
    gateAsFunctionalBind?: boolean;
    dismountOnRefusedRide?: boolean;
    carriageRouteBinds?: boolean;
    wakeLock?: boolean;
    commandEcho?: boolean;
} & Record<string, unknown>;

