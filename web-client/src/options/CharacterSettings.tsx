import { useState, useEffect, useRef, useCallback } from "react";
import storage, { getCurrentCharacter } from "@client/src/storage";
import GeneralSettings from "./Settings";
import GuildsSettings from "./GuildsSettings";

type Tab = "general" | "guild";

function CharacterSettings() {
    const [tab, setTab] = useState<Tab>("general");
    const scrollRefs = {
        general: useRef<HTMLDivElement>(null),
        guild: useRef<HTMLDivElement>(null),
    } as const;
    const scrollPos = useRef<Record<Tab, number>>({ general: 0, guild: 0 });
    const saveRefs = useRef<Record<Tab, () => void>>({ general: () => {}, guild: () => {} });
    const [locked, setLocked] = useState(!getCurrentCharacter());
    const [char, setChar] = useState<string | null>(getCurrentCharacter());

    function changeTab(next: Tab) {
        const current = scrollRefs[tab].current;
        if (current) {
            scrollPos.current[tab] = current.scrollTop;
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

    const registerGeneralSave = useCallback((fn: () => void) => {
        saveRefs.current.general = fn;
    }, []);

    const registerGuildSave = useCallback((fn: () => void) => {
        saveRefs.current.guild = fn;
    }, []);

    useEffect(() => {
        const handler = () => {
            const saves = [
                Promise.resolve(saveRefs.current.general()),
                Promise.resolve(saveRefs.current.guild()),
            ];
            Promise.all(saves).then(() => {
                window.dispatchEvent(new Event("close-options"));
            });
        };
        window.addEventListener("save-options", handler);
        return () => window.removeEventListener("save-options", handler);
    }, []);

    useEffect(() => {
        const current = scrollRefs[tab].current;
        if (current) {
            current.scrollTop = scrollPos.current[tab];
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
            <div className="flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
                <div
                    ref={scrollRefs.general}
                    className={`h-100 overflow-auto${tab === "general" ? "" : " d-none"}`}
                    style={{ minHeight: 0 }}
                >
                    <GeneralSettings registerSave={registerGeneralSave} />
                </div>
                <div
                    ref={scrollRefs.guild}
                    className={`h-100 overflow-auto${tab === "guild" ? "" : " d-none"}`}
                    style={{ minHeight: 0 }}
                >
                    <GuildsSettings registerSave={registerGuildSave} />
                </div>
            </div>
        </div>
    );
}

export default CharacterSettings;
