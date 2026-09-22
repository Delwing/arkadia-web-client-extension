import type { ContextMenuEntry } from './contextMenuStore';

export interface ContextMenuBlock {
    section?: string;
    variant?: ContextMenuEntry['variant'];
    items: ContextMenuEntry[];
    separatorBefore: boolean;
    caption?: string;
}

/**
 * Consecutive entries of one section and variant form a block. A separator
 * goes between sections (or where an entry asks for one); a section's caption
 * shows once, above its first block.
 */
export function groupEntries(items: ContextMenuEntry[]): ContextMenuBlock[] {
    const blocks: ContextMenuBlock[] = [];
    for (const item of items) {
        const last = blocks[blocks.length - 1] as ContextMenuBlock | undefined;
        const sameSection = last !== undefined && last.section === item.section;
        if (last && sameSection && !item.separator && last.variant === item.variant) {
            last.items.push(item);
            continue;
        }
        blocks.push({
            section: item.section,
            variant: item.variant,
            items: [item],
            separatorBefore: last !== undefined && (!sameSection || Boolean(item.separator)),
            caption: !sameSection ? item.section : undefined,
        });
    }
    return blocks;
}
