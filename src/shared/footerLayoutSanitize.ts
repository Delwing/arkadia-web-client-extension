import type {
    FooterBand,
    FooterBlockNode,
    FooterLayout,
    FooterNode,
} from '@shared/footerLayoutTypes';

/** Groups nest at most this deep inside a band; deeper ones are flattened away. */
const MAX_DEPTH = 4;

type Raw = Record<string, unknown>;

const isObject = (value: unknown): value is Raw =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const int = (value: unknown, min: number, max: number): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : undefined;

/** Copies the optional fields that came valid, leaving out the rest. */
function withOptional<T extends object>(node: T, extra: Partial<T>): T {
    for (const [key, value] of Object.entries(extra)) {
        if (value !== undefined) (node as Raw)[key] = value;
    }
    return node;
}

function block(raw: Raw): FooterBlockNode | null {
    const grow = int(raw.grow, 1, 100);
    switch (raw.block) {
        case 'chips': {
            const items = raw.items === 'rest'
                ? 'rest' as const
                : Array.isArray(raw.items)
                    ? raw.items.filter((id): id is string => typeof id === 'string' && id.length > 0)
                    : null;
            if (!items) return null;
            const arrange = raw.arrange === 'fold' || raw.arrange === 'wrap' || raw.arrange === 'grid' ? raw.arrange : 'wrap';
            return withOptional<FooterBlockNode>({ type: 'block', block: 'chips', items, arrange }, {
                grow,
                rows: int(raw.rows, 1, 8),
                look: raw.look === 'icon' || raw.look === 'text' ? raw.look : undefined,
                quiet: raw.quiet === true ? true : undefined,
            });
        }
        case 'multibinds':
            return withOptional<FooterBlockNode>({ type: 'block', block: 'multibinds' }, {
                grow,
                alwaysVisible: raw.alwaysVisible === true ? true : undefined,
            });
        case 'vitals':
            return withOptional<FooterBlockNode>({ type: 'block', block: 'vitals' }, {
                grow,
                perRow: int(raw.perRow, 1, 11),
                improveBar: raw.improveBar === true ? true : undefined,
            });
        case 'compass':
        case 'reconnect':
            return withOptional<FooterBlockNode>({ type: 'block', block: raw.block }, { grow });
        default:
            return null;
    }
}

function node(raw: unknown, depth: number): FooterNode | null {
    if (!isObject(raw)) return null;
    if (raw.type === 'block') return block(raw);
    if (raw.type !== 'row' && raw.type !== 'column') return null;
    if (depth >= MAX_DEPTH || !Array.isArray(raw.children)) return null;
    const children = raw.children.map((child) => node(child, depth + 1)).filter((child): child is FooterNode => child !== null);
    if (children.length === 0) return null;
    return withOptional<FooterNode>({ type: raw.type, children }, { grow: int(raw.grow, 1, 100) });
}

/**
 * A footer layout from anything (stored settings, pasted JSON): unknown blocks,
 * bad values and empty groups are dropped, numbers pulled into range, nesting
 * capped. `null` when nothing usable is left.
 */
export function sanitizeFooterLayout(input: unknown): FooterLayout | null {
    if (!isObject(input) || !Array.isArray(input.bands)) return null;
    const bands = input.bands
        .map((band): FooterBand | null => {
            if (!isObject(band) || !Array.isArray(band.children)) return null;
            const children = band.children.map((child) => node(child, 0)).filter((child): child is FooterNode => child !== null);
            return children.length > 0 ? { children } : null;
        })
        .filter((band): band is FooterBand => band !== null);
    return bands.length > 0 ? { bands } : null;
}
