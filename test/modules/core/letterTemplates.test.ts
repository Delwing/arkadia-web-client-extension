import { globalStorage } from '@modules/core/storage';
import {
    customLetterTemplateValue,
    customTemplateLayout,
    layoutToTemplateFields,
    listLetterTemplateChoices,
    loadCustomLetterTemplates,
    resolveLetterTemplate,
    saveCustomLetterTemplates,
} from '@modules/core/letterTemplates';
import { BUILTIN_LETTER_LAYOUTS } from '@shared/letterRenderer';
import type { CustomLetterTemplate } from '@client/types/letter';

const TEMPLATE: CustomLetterTemplate = {
    id: 'abc',
    name: 'Gwiazdki',
    header: '*{*}*\n',
    footer: '*{*}*\n\n',
    bodyPrefix: '* ',
    bodySuffix: ' *',
};

describe('letterTemplates', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it('saves and loads custom templates, skipping malformed entries', () => {
        saveCustomLetterTemplates([TEMPLATE]);
        expect(loadCustomLetterTemplates()).toEqual([TEMPLATE]);

        globalStorage.set('letter_templates', [TEMPLATE, { id: 'x' }, null] as never);
        expect(loadCustomLetterTemplates()).toEqual([TEMPLATE]);
    });

    it('returns an empty list when nothing is stored', () => {
        expect(loadCustomLetterTemplates()).toEqual([]);
    });

    it('drops trailing blank lines from header and footer', () => {
        expect(customTemplateLayout(TEMPLATE)).toEqual({
            header: ['*{*}*'],
            footer: ['*{*}*'],
            bodyPrefix: '* ',
            bodySuffix: ' *',
        });
    });

    it('turns a built-in layout into editable fields', () => {
        const fields = layoutToTemplateFields(BUILTIN_LETTER_LAYOUTS.plain);
        expect(customTemplateLayout({ id: 'p', name: 'p', ...fields })).toEqual({
            header: BUILTIN_LETTER_LAYOUTS.plain.header,
            footer: BUILTIN_LETTER_LAYOUTS.plain.footer,
            bodyPrefix: BUILTIN_LETTER_LAYOUTS.plain.bodyPrefix,
            bodySuffix: BUILTIN_LETTER_LAYOUTS.plain.bodySuffix,
        });
    });

    it('resolves built-in and custom selections', () => {
        expect(resolveLetterTemplate('parchment', [])?.layout).toBe(BUILTIN_LETTER_LAYOUTS.parchment);

        const custom = resolveLetterTemplate(customLetterTemplateValue('abc'), [TEMPLATE]);
        expect(custom?.value).toBe('custom:abc');
        expect(custom?.label).toBe('Gwiazdki');
        expect(custom?.layout.bodyPrefix).toBe('* ');
    });

    it('does not resolve unknown selections', () => {
        expect(resolveLetterTemplate('custom:missing', [TEMPLATE])).toBeNull();
        expect(resolveLetterTemplate('nope', [TEMPLATE])).toBeNull();
        expect(resolveLetterTemplate(undefined, [TEMPLATE])).toBeNull();
    });

    it('lists custom templates after the built-in ones', () => {
        const choices = listLetterTemplateChoices([TEMPLATE]);
        expect(choices[0]).toEqual({ value: 'none', label: 'Brak', custom: false });
        expect(choices[choices.length - 1]).toEqual({ value: 'custom:abc', label: 'Gwiazdki', custom: true });
    });
});
