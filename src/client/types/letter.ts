export const LETTER_TEMPLATES = ["none", "plain", "parchment", "parchment2", "parchment3", "raw"] as const;

export type LetterTemplate = (typeof LETTER_TEMPLATES)[number];

export interface LetterTemplateDefinition {
    readonly value: LetterTemplate;
    readonly displayLabel: string;
    readonly previewLabel: string;
    readonly supportsJustification: boolean;
}

const LETTER_TEMPLATE_DEFINITION_MAP: Record<LetterTemplate, LetterTemplateDefinition> = {
    none: {
        value: "none",
        displayLabel: "Brak",
        previewLabel: "bez szablonu",
        supportsJustification: true,
    },
    plain: {
        value: "plain",
        displayLabel: "Ramka",
        previewLabel: "Ramka",
        supportsJustification: true,
    },
    parchment: {
        value: "parchment",
        displayLabel: "Pergamin",
        previewLabel: "pergamin",
        supportsJustification: true,
    },
    parchment2: {
        value: "parchment2",
        displayLabel: "Pergamin II",
        previewLabel: "pergamin 2",
        supportsJustification: true,
    },
    parchment3: {
        value: "parchment3",
        displayLabel: "Pergamin III",
        previewLabel: "pergamin 3",
        supportsJustification: true,
    },
    raw: {
        value: "raw",
        displayLabel: "Bez formatowania",
        previewLabel: "bez formatowania",
        supportsJustification: true,
    },
};

export const LETTER_TEMPLATE_DEFINITIONS: Readonly<Record<LetterTemplate, LetterTemplateDefinition>> =
    LETTER_TEMPLATE_DEFINITION_MAP;

export const LETTER_TEMPLATE_CHOICES: readonly LetterTemplateDefinition[] =
    LETTER_TEMPLATES
        .map(template => LETTER_TEMPLATE_DEFINITION_MAP[template])
        .filter(definition => definition.supportsJustification);

export const LETTER_TEMPLATE_PREVIEW_LABELS: Readonly<Record<LetterTemplate, string>> =
    LETTER_TEMPLATES.reduce<Record<LetterTemplate, string>>((accumulator, template) => {
        accumulator[template] = LETTER_TEMPLATE_DEFINITION_MAP[template].previewLabel;
        return accumulator;
    }, {} as Record<LetterTemplate, string>);

export interface LetterSubmitPayload {
    to: string;
    cc: string;
    udw: string;
    subject: string;
    content: string;
    template: LetterTemplate;
}

export function isLetterTemplate(value: unknown): value is LetterTemplate {
    return typeof value === "string" && (LETTER_TEMPLATES as readonly string[]).includes(value);
}
