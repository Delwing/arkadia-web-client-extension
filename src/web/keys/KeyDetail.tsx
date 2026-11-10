import { Globe, Plug, Plus, X } from "lucide-react";
import { Button, DeleteButton, Segmented } from "@web-ui/primitives/index.ts";
import {
    classifyKey,
    comboId,
    comboLabel,
    entryWorks,
    freeKeysNear,
    isBrowserReserved,
    layerLabel,
    layerOf,
    REACH_LABELS,
    slotDef,
    toHelperKey,
    type Combo,
    type KeyEntry,
    type Reach,
} from "./keysModel";
import { assignKey, removeEntry, setReach } from "./keyEdits";
import { useKeys } from "./KeysContext";

const helperIdOf = (e: KeyEntry) => e.ref.kind === "slot" ? slotDef(e.ref.path)?.helperId : undefined;

function kindLabel(e: KeyEntry): string {
    if (e.ref.kind === "slot") return "wbudowane";
    if (e.ref.kind === "custom") return "własny";
    if (e.ref.kind === "plugin") return `plugin${e.owner ? ` ${e.owner}` : ""}`;
    return "helper";
}

/** Where one binding works: in the client, through the helper, or everywhere. */
function ReachChoice({ entry }: { entry: KeyEntry }) {
    const { data, helperSupported, applyEdit } = useKeys();
    const reserved = !!entry.combo && isBrowserReserved(entry.combo);
    // A plugin action runs in the page only.
    const helperOk = helperSupported && !!entry.combo && entry.ref.kind !== "plugin" && toHelperKey(entry.combo) !== null;
    const isBindAction = entry.targetLabel !== undefined || (entry.ref.kind === "helper" && entry.command === undefined);
    const options: { reach: Reach; short: string; hint: string; disabled: boolean }[] = [
        {
            reach: "client", short: "w kliencie",
            hint: reserved ? "ten klawisz zajmuje przeglądarka" : isBindAction ? "drugi klawisz działa tylko przez helpera" : "gdy okno klienta jest aktywne",
            disabled: reserved || isBindAction,
        },
        { reach: "helper", short: "przez helpera", hint: "gdy okno klienta jest aktywne, klawisz łapie helper", disabled: !helperOk },
        { reach: "global", short: "wszędzie", hint: "także gdy grasz w innym oknie", disabled: !helperOk },
    ];
    const current: Reach = entry.reach === "global_focus" ? "global" : entry.reach;
    const change = (reach: Reach) => applyEdit(setReach(data, entry, reach));
    // One row of choices instead of three stacked cards: the panel has to fit
    // beside the keyboard without scrolling.
    const offered = options.filter(o => !o.disabled || o.reach === current);
    return (
        <div className="keys-reach">
            <span className="keys-cap">Gdzie działa</span>
            <Segmented
                name={`reach-${entry.id}`}
                value={current}
                onChange={change}
                options={offered.map(o => ({
                    value: o.reach,
                    label: (
                        <>
                            {o.short}
                            {o.reach === "helper" && <Plug size={11} className="keys-helper-icon" />}
                            {o.reach === "global" && <Globe size={11} className="keys-global-icon" />}
                        </>
                    ),
                }))}
            />
            {current === "global" && (
                <label className="keys-reach__focus">
                    <input
                        type="checkbox"
                        checked={entry.reach === "global_focus"}
                        onChange={ev => change(ev.target.checked ? "global_focus" : "global")}
                    />
                    i przywołaj okno klienta
                </label>
            )}
            <p className="keys-muted">{options.find(o => o.reach === current)?.hint}</p>
            {!helperOk && <p className="keys-muted">Helper nie obsługuje tego klawisza.</p>}
        </div>
    );
}

interface Props {
    combo: Combo | null;
    /** Shown when the panel is a popover or a sheet, not a column. */
    onClose?: () => void;
    selectCombo: (combo: Combo) => void;
}

/** The selected key: what is on it, where each binding works, and what to do about a clash. */
export default function KeyDetail({ combo, onClose, selectCombo }: Props) {
    const { data, byCombo, helperConnected, helperSupported, capturingId, applyEdit, startCapture, addOwnCommand } = useKeys();
    if (!combo) {
        return (
            <div className="keys-detail keys-detail--empty">
                <p className="keys-dim">Wybierz klawisz na rysunku, by zobaczyć, co robi, albo coś mu przypisać.</p>
                <p className="keys-muted">Kliknij klawisz na liście poniżej i naciśnij nowy, by go zmienić.</p>
            </div>
        );
    }
    const list = byCombo.get(comboId(combo)) ?? [];
    const state = classifyKey(list, helperConnected);
    const reserved = isBrowserReserved(combo);
    const layerText = layerOf(combo) ? layerLabel(layerOf(combo)) : "bez modyfikatora";
    const single = list.length === 1 ? list[0] : null;
    const title = single ? single.label : state.conflict ? `${state.active.length} przypisania` : list.length > 1 ? state.active[0]?.label ?? "" : "Wolny klawisz";
    const free = state.conflict ? freeKeysNear(combo, byCombo) : [];
    const last = state.active[state.active.length - 1];
    const singleHelperId = single ? helperIdOf(single) : undefined;
    return (
        <div className="keys-detail">
            <div className="keys-detail__head">
                <span className={`keys-kc keys-kc--big${state.conflict ? " is-conflict" : ""}`}>{comboLabel(combo)}</span>
                <div className="keys-detail__title">
                    <span>{title}</span>
                    {/* What the binding is and where it works is spelled out in the
                        row below; repeating it here only moved the panel about. */}
                    {list.length === 0 && <span className="keys-muted">{layerText}</span>}
                </div>
                <span className="keys-spacer" />
                {state.conflict && <span className="keys-chip is-danger">konflikt</span>}
                {!state.conflict && state.shadowed.length > 0 && (
                    <span className="keys-chip is-ok"><Plug size={12} />przez helpera</span>
                )}
                {onClose && (
                    <button type="button" className="keys-ib" title="Zamknij" onClick={onClose}><X size={15} /></button>
                )}
            </div>
            {reserved && (
                <p className="keys-dim">
                    W przeglądarce ten skrót jest zajęty ({comboLabel(combo)} {combo.code === "KeyW" ? "zamyka kartę" : "robi coś w przeglądarce"}).
                    Helper przechwytuje go wcześniej.
                </p>
            )}
            {state.conflict && (
                <p className="keys-dim">Kilka przypisań na jednym klawiszu: naciśnięcie uruchomi wszystkie naraz.</p>
            )}
            {!state.conflict && state.shadowed.length > 0 && (
                <p className="keys-dim">
                    {state.helperTakesOver
                        ? "Helper przechwytuje ten klawisz, zanim dotrze do przeglądarki — działa ta sama funkcja, tylko wszędzie."
                        : "Gdy helper się połączy, przejmie ten klawisz i będzie działał także poza klientem."}
                </p>
            )}
            {list.length > 0 && (
                <div className="keys-acts">
                    {list.map(e => {
                        const shadowed = state.shadowed.includes(e);
                        const works = !shadowed && entryWorks(e, helperConnected);
                        const note = shadowed
                            ? (state.helperTakesOver ? "teraz obsługuje to helper" : "zadziała, gdy helper nie działa")
                            : works ? REACH_LABELS[e.reach] : "nie działa";
                        return (
                            <div key={e.id} className={`keys-act${shadowed ? " is-shadowed" : ""}`}>
                                <span className="keys-dot" data-group={e.group} />
                                <div className="keys-act__text">
                                    <span className={e.command !== undefined ? "keys-mono" : undefined}>{e.label}</span>
                                    <span className={works || shadowed ? "keys-muted" : "keys-danger"}>
                                        {kindLabel(e)} · {note}
                                    </span>
                                </div>
                                <Button size="sm" onClick={() => startCapture({ kind: "entry", entry: e })}>
                                    {capturingId === e.id ? "naciśnij…" : "Zmień klawisz"}
                                </Button>
                                {/* A built-in bind cannot be deleted, but it can be left
                                    without a key; an own shortcut goes altogether. */}
                                <DeleteButton
                                    title={e.ref.kind === "slot" || e.ref.kind === "plugin" ? "Zdejmij klawisz" : "Usuń skrót"}
                                    onClick={() => applyEdit(removeEntry(data, e))}
                                />
                            </div>
                        );
                    })}
                </div>
            )}
            {free.length > 0 && (
                <div className="keys-detail__free">
                    <span className="keys-muted">Wolne w pobliżu, kliknij, by przenieść „{last.label}”:</span>
                    <div className="keys-detail__keys">
                        {free.map(c => (
                            <button key={comboId(c)} type="button" className="keys-kc" onClick={() => { applyEdit(assignKey(data, last, c)); selectCombo(c); }}>
                                {comboLabel(c)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {helperSupported && single && <ReachChoice entry={single} />}
            {helperSupported && single && singleHelperId && (
                <button
                    type="button"
                    className="keys-add"
                    onClick={() => startCapture({ kind: "new-helper", target: singleHelperId, label: single.label })}
                >
                    <Plus size={14} strokeWidth={2.2} />Drugi klawisz przez helpera (np. globalny)
                </button>
            )}
            {list.length === 0 && (helperSupported || !reserved) && (
                <button
                    type="button"
                    className="keys-add"
                    onClick={() => addOwnCommand(reserved ? "helper" : "client", combo)}
                >
                    <Plus size={14} strokeWidth={2.2} />Przypisz komendę
                </button>
            )}
        </div>
    );
}
