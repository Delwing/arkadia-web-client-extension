import { useState, useEffect, useRef } from "react";
import storage, { getCurrentCharacter } from "@client/src/storage";
import GeneralSettings from "./Settings";
import Guilds from "./Guilds";

type Tab = "general" | "guild";

function CharacterSettings() {
    const [tab, setTab] = useState<Tab>("general");
    const scrollRef = useRef<HTMLDivElement>(null);
    const scrollPos = useRef<Record<Tab, number>>({ general: 0, guild: 0 });
    const saveRef = useRef<() => void>(() => {});
    const [locked, setLocked] = useState(!getCurrentCharacter());
    const [char, setChar] = useState<string | null>(getCurrentCharacter());

    function changeTab(next: Tab) {
        if (scrollRef.current) {
            scrollPos.current[tab] = scrollRef.current.scrollTop;
        }
        setTab(next);
    }

    useEffect(() => {
        const showGeneral = () => changeTab("general");
        const showGuild = () => changeTab("guild");
        window.addEventListener("show-general-settings", showGeneral);
        window.addEventListener("show-guild-settings", showGuild);
        return () => {
            window.removeEventListener("show-general-settings", showGeneral);
            window.removeEventListener("show-guild-settings", showGuild);
        };
    }, [tab]);

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

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollPos.current[tab];
        }
    }, [tab]);

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
                        onClick={() => changeTab("general")}
                    >
                        Ogólne
                    </button>
                    <button
                        className={`btn btn-sm ${tab === "guild" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => changeTab("guild")}
                    >
                        Gildie
                    </button>
                </div>
            </div>
            <div ref={scrollRef} className="flex-grow-1 overflow-auto" style={{ minHeight: 0 }}>
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
