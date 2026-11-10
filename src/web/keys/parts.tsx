import type { ReactNode } from "react";
import { Globe, Plug } from "lucide-react";
import { classifyKey, comboId, comboLabel, GROUPS, REACH_LABELS, type Group, type KeyEntry } from "./keysModel";
import { rowClass, useKeys } from "./KeysContext";

/** A binding's key as a keycap button; pressing it waits for the new key. */
export function KeyChip({ entry, compact = false }: { entry: KeyEntry; compact?: boolean }) {
    const { capturingId, byCombo, helperConnected, startCapture, cancelCapture } = useKeys();
    const capturing = capturingId === entry.id;
    const conflict = entry.combo && classifyKey(byCombo.get(comboId(entry.combo)) ?? [], helperConnected).conflict;
    let text: string;
    if (capturing) text = "naciśnij…";
    else if (entry.combo) text = comboLabel(entry.combo);
    else if (entry.inherits) text = compact ? "jak Funkc." : "jak Funkcyjny";
    else text = "brak";
    const cls = ["keys-kc", capturing && "is-capturing", !entry.combo && !capturing && "is-none", conflict && !capturing && "is-conflict"]
        .filter(Boolean).join(" ");
    return (
        <button
            type="button"
            className={cls}
            data-entry={entry.id}
            title={capturing ? "Esc anuluje · Backspace czyści" : `Zmień klawisz: ${entry.label}`}
            onClick={() => capturing ? cancelCapture() : startCapture({ kind: "entry", entry })}
        >
            {text}
        </button>
    );
}

/** Where a binding is heard, when it is not simply the client. */
export function ReachBadge({ entry }: { entry: KeyEntry }) {
    if (entry.reach === "client") return null;
    const title = `${entry.label}: ${REACH_LABELS[entry.reach]}`;
    return entry.reach === "helper"
        ? <Plug size={12} className="keys-helper-icon" aria-label={title}><title>{title}</title></Plug>
        : <Globe size={12} className="keys-global-icon" aria-label={title}><title>{title}</title></Globe>;
}

export function SectionHead({ group, extra, count }: { group: Group | "helper"; extra?: ReactNode; count?: number }) {
    return (
        <div className="keys-section__head">
            {group === "helper"
                ? <Plug size={13} strokeWidth={2.2} className="keys-helper-icon" />
                : <span className="keys-dot" data-group={group} />}
            <span className="keys-cap">{group === "helper" ? "Obsługiwane przez helpera" : GROUPS.find(g => g.id === group)!.label}</span>
            {count !== undefined && <span className="keys-chip">{count}</span>}
            <span className="keys-spacer" />
            {extra}
        </div>
    );
}

/**
 * One binding in a list: its name and key; clicking the name selects the key.
 * `children` go after the name (a delete button, say).
 */
export function BindRow({ entry, dimLabel = false, children }: { entry: KeyEntry; dimLabel?: boolean; children?: ReactNode }) {
    const { search, selectEntry } = useKeys();
    return (
        <div
            className={rowClass(entry, search)}
            data-bind={entry.id}
            title={entry.combo ? `Pokaż klawisz ${comboLabel(entry.combo)}` : undefined}
            onClick={() => selectEntry(entry)}
        >
            <span className={`keys-row__label${dimLabel ? " is-dim" : ""}`}>
                {entry.label}
                <ReachBadge entry={entry} />
                {children}
            </span>
            <KeyChip entry={entry} />
        </div>
    );
}
