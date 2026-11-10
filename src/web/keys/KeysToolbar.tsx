import { useState, type ReactNode } from "react";
import { MoreHorizontal, Plug, Plus } from "lucide-react";
import { Button, Input } from "@web-ui/primitives/index.ts";
import type { Keymap } from "@modules/core/keymapTypes";
import type { HelperConnection, HelperState } from "@modules/helper/HelperConnection";
import { usePopover } from "@web/layout/hooks/usePopover.ts";
import type { Size } from "./useKeysSize";

interface HelperChipProps {
    helperConnection: HelperConnection;
    state: HelperState;
    platform: string | null;
    size: Size;
}

/** The helper's state; clicking it launches a disconnected helper. */
export function HelperChip({ helperConnection, state, platform, size }: HelperChipProps) {
    const connected = state === "connected";
    return (
        <button
            type="button"
            className={`keys-chip keys-chip--button${connected ? " is-ok" : ""}`}
            title={connected ? "Helper połączony" : "Helper niepołączony: kliknij, by uruchomić"}
            onClick={() => { if (state === "disconnected") helperConnection.launch(); }}
        >
            <Plug size={12} />
            {size === "wide" ? (connected ? `Helper połączony${platform ? ` · ${platform}` : ""}` : "Helper niepołączony") : "Helper"}
        </button>
    );
}

interface Props {
    size: Size;
    keymapList: readonly Keymap[];
    keymapId: string;
    numLockAware: boolean;
    helperChip: ReactNode;
    onSwitch: (id: string) => void;
    /** Makes a new keymap and returns it, so its name can be edited at once. */
    onCreate: () => Keymap;
    onRename: (name: string) => void;
    onToggleNumLock: () => void;
    onImportMultibinds: () => void;
    onConfirm: (what: "delete" | "restore") => void;
}

interface MenuItem {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
    danger?: boolean;
    checked?: boolean;
}

/** The keymap picker (renamed in place), the helper's chip and the "more" menu. */
export default function KeysToolbar({
    size, keymapList, keymapId, numLockAware, helperChip, onSwitch, onCreate, onRename, onToggleNumLock, onImportMultibinds, onConfirm,
}: Props) {
    const [renaming, setRenaming] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const more = usePopover({ width: 240 });

    const create = () => {
        const created = onCreate();
        setNameDraft(created.name);
        setRenaming(true);
    };
    const startRename = () => {
        setNameDraft(keymapList.find(k => k.id === keymapId)?.name ?? "");
        setRenaming(true);
    };
    const finishRename = () => {
        onRename(nameDraft);
        setRenaming(false);
    };

    const items: MenuItem[] = [
        { label: "Zmień nazwę mapy", onSelect: startRename },
        ...(size === "wide" ? [] : [{ label: "Nowa mapa", onSelect: create }]),
        { label: "Importuj bazę multibindów…", onSelect: onImportMultibinds },
        // Off: the numpad is the numpad either way. On: with NumLock off it acts as
        // arrows and its keys can be bound apart (Num↑, NumHome…).
        { label: "Rozróżniaj NumLock", checked: numLockAware, onSelect: onToggleNumLock },
        { label: "Przywróć domyślne", onSelect: () => onConfirm("restore") },
        { label: "Usuń mapę klawiszy", onSelect: () => onConfirm("delete"), disabled: keymapList.length <= 1, danger: true },
    ];

    return (
        <div className="keys-toolbar">
            {size !== "phone" && size !== "narrow" && <span className="keys-muted">Mapa</span>}
            {renaming ? (
                <Input
                    mono
                    className="keys-toolbar__name"
                    value={nameDraft}
                    onChange={ev => setNameDraft(ev.target.value)}
                    onBlur={finishRename}
                    onKeyDown={ev => {
                        if (ev.key === "Enter") finishRename();
                        else if (ev.key === "Escape") setRenaming(false);
                    }}
                    data-dialog-escape="local"
                    autoFocus
                />
            ) : (
                <select
                    id="binds-keymap-select"
                    className="popup-input popup-input--control keys-toolbar__map"
                    value={keymapId}
                    onChange={ev => onSwitch(ev.target.value)}
                >
                    {keymapList.map(k => <option key={k.id} value={k.id}>{k.name}</option>)}
                </select>
            )}
            <span className="keys-spacer" />
            {size !== "narrow" && size !== "phone" && helperChip}
            {size === "wide" && (
                <Button size="sm" variant="ghost" onClick={create} title="Nowa mapa (kopia bieżących bindów)">
                    <Plus size={14} strokeWidth={2.2} />Nowa mapa
                </Button>
            )}
            <div className="popup-menu-anchor" ref={more.rootRef}>
                <button ref={more.anchorRef} type="button" className={`keys-ib${more.open ? " is-active" : ""}`} title="Więcej" onClick={more.toggle}>
                    <MoreHorizontal size={16} />
                </button>
                {more.style && (
                    <div className="popup-popover popup-menu" style={more.style}>
                        {items.map(item => (
                            <button
                                key={item.label}
                                type="button"
                                className={`popup-menu__item${item.danger ? " keys-menu-danger" : ""}${item.checked ? " is-on" : ""}`}
                                title={item.label}
                                disabled={item.disabled}
                                onClick={() => { more.close(); item.onSelect(); }}
                            >
                                {item.checked !== undefined && <span className="popup-menu__check" />}
                                {item.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
