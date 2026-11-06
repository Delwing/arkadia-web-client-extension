import { migrateImportedValue } from '@modules/core/settingsMigrations';
import type { CategoryHandler, ImportContext } from "../categoryHandler";
import { readJsonObject } from "../storageKeys";

/*
 * Both categories live in the one `mobileButtonSettings` key locally: the
 * radial menu is shared between devices, the rest of the mobile layout and
 * the desktop buttons are device-scoped.
 */

export interface ExportedButtons {
    mobileButtonSettings?: string;
    desktopButtonSettings?: string;
}

export interface ExportedRadial {
    radial?: unknown;
}

/** Write mobileButtonSettings back through the settings migration. */
function writeMobileButtonSettings(settings: Record<string, unknown>, { storage }: ImportContext): void {
    storage.setItem('mobileButtonSettings', migrateImportedValue('mobileButtonSettings', JSON.stringify(settings)));
}

export const buttonsCategory: CategoryHandler = {
    export() {
        const data: ExportedButtons = {};
        const mobile = localStorage.getItem('mobileButtonSettings');
        if (mobile) {
            try {
                const parsed = JSON.parse(mobile);
                const { radial: _radial, ...rest } = parsed;
                if (Object.keys(rest).length > 0) {
                    data.mobileButtonSettings = JSON.stringify(rest);
                }
            } catch {
                data.mobileButtonSettings = mobile;
            }
        }
        const desktop = localStorage.getItem('desktopButtonSettings');
        if (desktop) data.desktopButtonSettings = desktop;
        return Object.keys(data).length > 0 ? JSON.stringify(data) : null;
    },

    import(data, ctx) {
        // Merge with existing mobileButtonSettings to preserve radial
        if (data.mobileButtonSettings) {
            let merged = readJsonObject('mobileButtonSettings');
            try {
                const incoming = JSON.parse(data.mobileButtonSettings);
                if (incoming?.version !== 2) {
                    // A v1 export: drop the local v2 data, or it would win over the
                    // incoming layouts and the import would silently do nothing.
                    const { version: _version, modes: _modes, styles: _styles, styleOrder: _styleOrder, ...rest } = merged;
                    merged = rest;
                }
                merged = { ...merged, ...incoming };
            } catch {
                // Invalid incoming data
            }
            writeMobileButtonSettings(merged, ctx);
        }
        if (data.desktopButtonSettings && !ctx.skipDeviceScoped) {
            ctx.storage.setItem('desktopButtonSettings', data.desktopButtonSettings);
        }
    },
};

export const radialCategory: CategoryHandler = {
    export() {
        const mobile = localStorage.getItem('mobileButtonSettings');
        if (!mobile) return null;
        try {
            const parsed = JSON.parse(mobile);
            if (parsed.radial) {
                return JSON.stringify({ radial: parsed.radial });
            }
        } catch {
            // Invalid JSON
        }
        return null;
    },

    import(data, ctx) {
        if (data.radial) {
            const merged = readJsonObject('mobileButtonSettings');
            merged.radial = data.radial;
            writeMobileButtonSettings(merged, ctx);
        }
    },
};
