import { Download, Globe, Plug, Plus } from "lucide-react";
import { Button, DeleteButton } from "@web-ui/primitives/index.ts";
import type { HelperConnection, HelperState } from "@modules/helper/HelperConnection";
import { isStandaloneWindow } from "@modules/helper/helperResync";
import { getDownloadUrl } from "@web/helperDownload.ts";
import { FOCUS_HELPER_TARGET, type KeyEntry } from "../keysModel";
import { removeEntry } from "../keyEdits";
import { useKeys } from "../KeysContext";
import { KeyChip } from "../parts";

interface Props {
    helperConnection: HelperConnection | null | undefined;
    helperState: HelperState;
    helperPlatform: string | null;
    /** The hotkey that only brings the client window to the front, if set. */
    focusEntry: KeyEntry | undefined;
}

/** The helper block is about the helper itself; the bindings live in the lists. */
export default function HelperSection({ helperConnection, helperState, helperPlatform, focusEntry }: Props) {
    const { data, entries, helperConnected, applyEdit, startCapture } = useKeys();
    const notWorking = entries.filter(e => e.reach !== "client" && !helperConnected).length;
    const download = getDownloadUrl();
    return (
        <section className="keys-section keys-helper" data-section="helper">
            <div className="keys-helper__status">
                {helperConnected ? (
                    <div className="keys-helper__box is-ok">
                        <Plug size={15} />
                        <span>Helper połączony{helperPlatform ? ` · ${helperPlatform}` : ""}. Skróty oznaczone <Globe size={12} className="keys-global-icon" /> działają w każdym oknie.</span>
                    </div>
                ) : (
                    <div className="keys-helper__box">
                        <Plug size={15} />
                        <span>
                            Helper niepołączony.
                            {notWorking > 0 && <span className="keys-dim"> {notWorking} {notWorking === 1 ? "skrót działa tylko w kliencie" : "skróty działają tylko w kliencie"}.</span>}
                        </span>
                        {helperConnection && (
                            <Button size="sm" onClick={() => helperState === "disconnected" ? helperConnection.launch() : undefined} disabled={helperState === "connecting"}>
                                {helperState === "connecting" ? "Łączenie…" : "Uruchom"}
                            </Button>
                        )}
                    </div>
                )}
                <div className="keys-row keys-row--focus">
                    <span className="keys-row__label">Przywołaj okno klienta</span>
                    {focusEntry
                        ? <><KeyChip entry={focusEntry} /><DeleteButton onClick={() => applyEdit(removeEntry(data, focusEntry))} /></>
                        : (
                            <button
                                type="button"
                                className="keys-add"
                                onClick={() => startCapture({ kind: "new-helper", target: FOCUS_HELPER_TARGET, label: "Przywołaj okno klienta" })}
                            >
                                <Plus size={14} strokeWidth={2.2} />Nadaj klawisz
                            </button>
                        )}
                </div>
            </div>
            <div className="keys-helper__notes">
                <p className="keys-dim">
                    Helper słyszy klawisze także poza klientem i te, których przeglądarka nie oddaje (na rysunku kreskowane).
                    Zaznacz klawisz i wybierz „gdzie działa”.
                </p>
                {!helperConnected && download && (
                    <a className="keys-link" href={download.url} download>
                        Pobierz helpera — {download.label}<Download size={13} />
                    </a>
                )}
                <p className="keys-muted keys-helper__platforms">
                    Windows: wszystko · macOS: wymaga uprawnienia Dostępność · Linux: X11 z xdotool lub wmctrl, bez Waylanda
                </p>
                <p className="keys-muted keys-helper__platforms">
                    {isStandaloneWindow()
                        ? "„Wszędzie + okno” przywołuje okno klienta — masz je osobno, więc trafia prosto w grę."
                        : "„Wszędzie + okno” przywołuje okno przeglądarki i działa, gdy klient jest w nim aktywną kartą: przeglądarka nie pozwala przełączać kart z zewnątrz. Zainstaluj klienta jako aplikację (menu przeglądarki → Zainstaluj), a dostanie własne okno i przywołanie zawsze trafi w grę."}
                </p>
            </div>
        </section>
    );
}
