import { useState, useEffect, useRef } from "react";
import storage, { getCurrentCharacter } from "@client/src/storage";
import GeneralSettings from "./Settings";
import Guilds from "./Guilds";

type Tab = "general" | "guild";

function CharacterSettings() {
    const [tab, setTab] = useState<Tab>("general");
    const saveRef = useRef<() => void>(() => {});
    const [locked, setLocked] = useState(!getCurrentCharacter());
    const [char, setChar] = useState<string | null>(getCurrentCharacter());

    useEffect(() => {
        const showGeneral = () => setTab("general");
        const showGuild = () => setTab("guild");
        window.addEventListener("show-general-settings", showGeneral);
        window.addEventListener("show-guild-settings", showGuild);
        return () => {
            window.removeEventListener("show-general-settings", showGeneral);
            window.removeEventListener("show-guild-settings", showGuild);
        };
    }, []);

    useEffect(() => {
        const update = () => {
            const current = getCurrentCharacter();
            setLocked(!current);
            setChar(current);
        };
        storage.onChanged?.addListener(update);
        window.addEventListener("storage", update);
        return () => {
            storage.onChanged?.removeListener?.(update);
            window.removeEventListener("storage", update);
        };
    }, []);

    function registerSave(fn: () => void) {
        saveRef.current = fn;
    }

    useEffect(() => {
        const handler = () => saveRef.current();
        window.addEventListener("save-options", handler);
        return () => window.removeEventListener("save-options", handler);
    }, []);

    return (
        <div className="p-2 d-flex flex-column h-100" style={{ minHeight: 0 }}>
            {locked ? (
                <div className="alert alert-info" role="alert">
                    Opcje zależne od postaci są zablokowane do momentu jej wybrania.
                </div>
            ) : (
                char && (
                    <div className="alert alert-info" role="alert">
                        Ustawienia dotyczą postaci: <strong>{char}</strong>
                    </div>
                )
            )}
            <div className="mb-3 pb-2 flex-shrink-0">
                <div className="d-flex gap-2">
                    <button
                        className={`btn btn-sm ${tab === "general" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setTab("general")}
                    >
                        Ogólne
                    </button>
                    <button
                        className={`btn btn-sm ${tab === "guild" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setTab("guild")}
                    >
                        Gildie
                    </button>
                </div>
            </div>
            <div className="flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
                {tab === "general" ? (
                    <GeneralSettings registerSave={registerSave} />
                ) : (
                    <Guilds registerSave={registerSave} />
                )}
            </div>
        </div>
    );
}

export default CharacterSettings;
