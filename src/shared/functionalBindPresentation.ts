import type { RenderSettings } from './uiSettingsTypes';
import { defaultRenderSettings } from './settingsDefaults';

export type FunctionalBindPresentation = Pick<RenderSettings,
    'functionalBindOutput' | 'functionalBindTemplate' | 'functionalBindColor' |
    'functionalBindKeyColor' | 'functionalBindActionColor' | 'functionalBindInFooter'>;

export function normalizeFunctionalBindPresentation(value: Partial<FunctionalBindPresentation>): FunctionalBindPresentation {
    const color = (input: unknown, fallback: string) =>
        typeof input === 'string' && /^#[0-9a-f]{6}$/i.test(input) ? input : fallback;
    return {
        functionalBindOutput: value.functionalBindOutput === 'compact' || value.functionalBindOutput === 'hidden'
            ? value.functionalBindOutput : 'full',
        functionalBindTemplate: typeof value.functionalBindTemplate === 'string' && value.functionalBindTemplate.trim()
            ? value.functionalBindTemplate.replace(/[\r\n\t]/g, ' ') : defaultRenderSettings.functionalBindTemplate,
        functionalBindColor: color(value.functionalBindColor, defaultRenderSettings.functionalBindColor),
        functionalBindKeyColor: color(value.functionalBindKeyColor, defaultRenderSettings.functionalBindKeyColor),
        functionalBindActionColor: color(value.functionalBindActionColor, ''),
        functionalBindInFooter: value.functionalBindInFooter === true,
    };
}

/** Substitute once, so braces in the action itself stay literal. */
export function functionalBindParts(label: string, action: string, settings: FunctionalBindPresentation) {
    return settings.functionalBindTemplate.split(/(\{key\}|\{action\})/).map(part => ({
        text: part === '{key}' ? label : part === '{action}' ? action : part,
        color: part === '{key}' ? settings.functionalBindKeyColor
            : part === '{action}' ? settings.functionalBindActionColor : settings.functionalBindColor,
        action: part === '{action}',
    }));
}
