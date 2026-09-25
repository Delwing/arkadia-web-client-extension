/**
 * Letter templates the user made, kept in global storage (shared by all
 * characters and synced), and resolving a template selection to a layout.
 */

import { globalStorage } from './storage';
import {
    CUSTOM_LETTER_TEMPLATE_PREFIX,
    LETTER_TEMPLATE_DEFINITIONS,
    LETTER_TEMPLATE_CHOICES,
    isLetterTemplate,
    type CustomLetterTemplate,
    type LetterTemplateId,
} from '@client/types/letter';
import { BUILTIN_LETTER_LAYOUTS, type LetterLayout } from '@shared/letterRenderer';

export const LETTER_TEMPLATES_STORAGE_KEY = 'letter_templates';

function isCustomTemplate(value: unknown): value is CustomLetterTemplate {
    if (!value || typeof value !== 'object') return false;
    const t = value as Record<string, unknown>;
    return typeof t.id === 'string' && t.id.length > 0
        && typeof t.name === 'string'
        && typeof t.header === 'string'
        && typeof t.footer === 'string'
        && typeof t.bodyPrefix === 'string'
        && typeof t.bodySuffix === 'string';
}

export function loadCustomLetterTemplates(): CustomLetterTemplate[] {
    const stored = globalStorage.get(LETTER_TEMPLATES_STORAGE_KEY);
    return Array.isArray(stored) ? stored.filter(isCustomTemplate) : [];
}

export function saveCustomLetterTemplates(templates: CustomLetterTemplate[]): void {
    globalStorage.set(LETTER_TEMPLATES_STORAGE_KEY, templates);
}

export function onCustomLetterTemplatesChange(listener: (templates: CustomLetterTemplate[]) => void): () => void {
    return globalStorage.onChange(LETTER_TEMPLATES_STORAGE_KEY, () => listener(loadCustomLetterTemplates()));
}

export function createCustomLetterTemplateId(): string {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function customLetterTemplateValue(id: string): LetterTemplateId {
    return `${CUSTOM_LETTER_TEMPLATE_PREFIX}${id}`;
}

function splitFrameLines(text: string): string[] {
    const lines = text.split(/\r?\n/);
    while (lines.length && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines;
}

export function customTemplateLayout(template: CustomLetterTemplate): LetterLayout {
    return {
        header: splitFrameLines(template.header),
        footer: splitFrameLines(template.footer),
        bodyPrefix: template.bodyPrefix,
        bodySuffix: template.bodySuffix,
    };
}

/** A built-in layout as editable template fields, to start a custom one from. */
export function layoutToTemplateFields(layout: LetterLayout): Omit<CustomLetterTemplate, 'id' | 'name'> {
    return {
        header: layout.header.join('\n'),
        footer: layout.footer.join('\n'),
        bodyPrefix: layout.bodyPrefix,
        bodySuffix: layout.bodySuffix,
    };
}

export interface ResolvedLetterTemplate {
    value: LetterTemplateId;
    label: string;
    layout: LetterLayout;
}

/** The template a selection value names, or null when there is no such template. */
export function resolveLetterTemplate(
    value: unknown,
    customTemplates: readonly CustomLetterTemplate[] = loadCustomLetterTemplates(),
): ResolvedLetterTemplate | null {
    if (isLetterTemplate(value)) {
        return {
            value,
            label: LETTER_TEMPLATE_DEFINITIONS[value].previewLabel,
            layout: BUILTIN_LETTER_LAYOUTS[value],
        };
    }
    if (typeof value === 'string' && value.startsWith(CUSTOM_LETTER_TEMPLATE_PREFIX)) {
        const id = value.slice(CUSTOM_LETTER_TEMPLATE_PREFIX.length);
        const template = customTemplates.find(t => t.id === id);
        if (template) {
            return {
                value: customLetterTemplateValue(id),
                label: template.name,
                layout: customTemplateLayout(template),
            };
        }
    }
    return null;
}

export interface LetterTemplateChoice {
    value: LetterTemplateId;
    label: string;
    custom: boolean;
}

export function listLetterTemplateChoices(
    customTemplates: readonly CustomLetterTemplate[] = loadCustomLetterTemplates(),
): LetterTemplateChoice[] {
    return [
        ...LETTER_TEMPLATE_CHOICES.map(choice => ({ value: choice.value, label: choice.displayLabel, custom: false })),
        ...customTemplates.map(t => ({ value: customLetterTemplateValue(t.id), label: t.name || '(bez nazwy)', custom: true })),
    ];
}
