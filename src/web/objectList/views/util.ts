// String helpers for the views.

export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Join class names, skipping empty ones. */
export function cls(...names: (string | false | null | undefined)[]): string {
    return names.filter(Boolean).join(' ');
}
