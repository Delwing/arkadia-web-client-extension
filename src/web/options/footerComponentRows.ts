import type { FooterComponentConfig } from "../defaultUiSettings";

/**
 * The joins behind the footer settings panel, kept out of the component itself
 * so they can be tested directly (and so the component file only exports a
 * component).
 *
 * The panel used to be a straight editor over `uiSettings.footerComponents`, a
 * fixed list of built-in chips. It now also offers whatever plugins have
 * registered with the common footer registry, which means two joins: config
 * plus live registry on the way in (`merge`), and rows plus the entries nothing
 * is registered for on the way back out (`toConfig`).
 */

export const DISPLAY_NAMES: Record<string, string> = {
    'clock-display': 'Zegar',
    'transport-timer': 'Timer transportu',
    'lamp-timer': 'Timer lampy',
    'pipe-status': 'Fajka',
    'break-item-warning': 'Ostrzezenie o uszkodzeniu',
    'mail-status': 'Status poczty',
    'package-status': 'Status paczki',
    'weapon-state': 'Stan broni',
    'attack-mode': 'Tryb ataku',
    'release-guard-timer': 'Timer zasloniecia',
    'zask-timer': 'Timer zaskoczenia',
    'order-timer': 'Timer rozkazu',
    'combat-timer': 'Timer walki (30s)',
    'world-destruction-timer': 'Timer apokalipsy',
    'team-panel': 'Panel druzyny',
    'connection-status': 'Ping i zegar proxy',
};

/** A config row plus what to call it, which for a plugin only the registry knows. */
export interface FooterRow extends FooterComponentConfig {
    label: string;
    fromPlugin: boolean;
}

/** What `merge` needs of a registry item; see @modules/core/footerRegistry. */
export interface RegisteredItem {
    id: string;
    label?: string;
    source?: string;
    order: number;
}

/** Ids the plugin footer registry registers components under. */
const PLUGIN_ID_PREFIX = 'plugin:';

/** Ids safe to drop straight into a DOM id and a `querySelector('#...')`. */
const PLAIN_ID = /^[A-Za-z0-9_-]+$/;
const safeIds = new Map<string, string>();

/**
 * A DOM-safe stand-in for a component id.
 *
 * dnd-kit looks its sortable items up with `querySelector('#' + id)`, and a
 * plugin's id is `plugin:<pluginId>:<local id>` whose pluginId is usually the
 * plugin's URL - colons and slashes throughout. That is not a valid selector,
 * so the lookup throws and takes the whole settings panel down with it. Built-in
 * ids are already plain and pass through untouched, which keeps `#fc-<id>`
 * working for them.
 */
export function domId(id: string): string {
    if (PLAIN_ID.test(id)) return id;
    let safe = safeIds.get(id);
    if (!safe) {
        // Tail rather than head: the end of a plugin id is the part that differs.
        safe = `p${safeIds.size}-${id.replace(/[^A-Za-z0-9_-]+/g, '-').slice(-40)}`;
        safeIds.set(id, safe);
    }
    return safe;
}

/**
 * The rows to show: the stored config, plus anything a plugin has registered
 * that the config has not heard of yet, in the place the plugin asked for.
 *
 * A configured *plugin* component with nothing registered behind it is dropped:
 * the plugin is not loaded, so there is nothing to switch and nothing to call
 * it but its id. Built-ins are kept whether or not they are registered, because
 * only the forge HUD registers them - in the stock UI the config is all there
 * is, and dropping them would empty this panel. They are not dropped from the
 * *config* either way; see `toConfig`.
 */
export function merge(components: FooterComponentConfig[], registered: RegisteredItem[]): FooterRow[] {
    const byId = new Map(registered.map((item) => [item.id, item]));
    const configured = new Set(components.map((c) => c.id));

    const rows: Array<FooterRow & { sortKey: number }> = [];
    for (const c of [...components].sort((a, b) => a.order - b.order)) {
        const item = byId.get(c.id);
        if (!item && c.id.startsWith(PLUGIN_ID_PREFIX)) continue;
        rows.push({
            ...c,
            label: DISPLAY_NAMES[c.id] || item?.label || c.id,
            fromPlugin: item ? item.source === 'plugin' : c.id.startsWith(PLUGIN_ID_PREFIX),
            // Matches the registry's own band for configured items, so the
            // panel's order is the order the footer will render in.
            sortKey: 100 + c.order,
        });
    }
    for (const item of registered) {
        if (configured.has(item.id)) continue;
        rows.push({
            id: item.id,
            visible: true,
            order: 0,
            label: DISPLAY_NAMES[item.id] || item.label || item.id,
            fromPlugin: item.source === 'plugin',
            // Its own order - 0 for "start", 1000 for "end" - which is what puts
            // an unconfigured plugin component before or after the built-ins.
            sortKey: item.order,
        });
    }

    return rows
        .sort((a, b) => a.sortKey - b.sortKey)
        .map(({ sortKey: _sortKey, ...row }) => row);
}

/**
 * Back to stored config. Entries for things that are not registered right now
 * are carried through untouched: a plugin that is merely switched off should
 * find its place again when it comes back, rather than having been forgotten
 * because somebody reordered the chips while it was away.
 */
export function toConfig(rows: FooterRow[], previous: FooterComponentConfig[]): FooterComponentConfig[] {
    const shown = new Set(rows.map((r) => r.id));
    const kept = previous.filter((c) => !shown.has(c.id));
    return [
        ...rows.map(({ label: _label, fromPlugin: _fromPlugin, ...c }) => c),
        // After the visible rows, so they never displace anything on screen.
        ...kept.map((c, i) => ({ ...c, order: rows.length + i })),
    ];
}
