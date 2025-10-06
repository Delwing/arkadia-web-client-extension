export const LETTER_TEMPLATES = ["plain", "parchment", "parchment2", "parchment3"] as const;

export type LetterTemplate = (typeof LETTER_TEMPLATES)[number];

export interface LetterSubmitPayload {
    to: string;
    cc: string;
    subject: string;
    content: string;
    template: LetterTemplate;
}

export function isLetterTemplate(value: unknown): value is LetterTemplate {
    return typeof value === "string" && (LETTER_TEMPLATES as readonly string[]).includes(value);
}
