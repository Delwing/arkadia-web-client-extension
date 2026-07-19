import { setDeviceViewSettings } from '@modules/core/settings';

/**
 * Temporary way back to the stock UI. Forge-ui has no settings surface of its
 * own yet (that lands in the migration's settings-porting phase) — until then,
 * this is the only way to flip `preferredShell` back from here. Persists the
 * device-scoped preference and reloads; the inline script at the top of
 * `index.html` reads it and redirects there.
 */
export default function ShellPickerButton() {
    return (
        <button
            type="button"
            className="shell-picker-button"
            title="Wróć do klasycznego interfejsu"
            onClick={() => {
                setDeviceViewSettings({ preferredShell: 'stock' });
                window.location.reload();
            }}
        >
            Klasyczny interfejs
        </button>
    );
}
