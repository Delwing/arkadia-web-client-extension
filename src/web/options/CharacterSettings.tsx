import { useState, useEffect, useRef, useCallback } from "react";
import storage, { getCurrentCharacter } from "@modules/core/storage";
import GeneralSettings from "./Settings";
import GuildsSettings from "./GuildsSettings";
import LuaGagsSettings from "./LuaGagsSettings";
import EnemyBindsSettings from "./EnemyBindsSettings";
import MagikiSettings from "./MagikiSettings";

type Tab = "general" | "guild" | "luaGags" | "enemyBinds" | "magiki";

function CharacterSettings() {
    const [tab, setTab] = useState<Tab>("general");
    const scrollRefs = {
        general: useRef<HTMLDivElement>(null),
        guild: useRef<HTMLDivElement>(null),
        luaGags: useRef<HTMLDivElement>(null),
        enemyBinds: useRef<HTMLDivElement>(null),
        magiki: useRef<HTMLDivElement>(null),
    } as const;
    const scrollPos = useRef<Record<Tab, number>>({ general: 0, guild: 0, luaGags: 0, enemyBinds: 0, magiki: 0 });
    const saveRefs = useRef<Record<Tab, (settings: any) => void>>({ general: () => {}, guild: () => {}, luaGags: () => {}, enemyBinds: () => {}, magiki: () => {} });
    const [locked, setLocked] = useState(!getCurrentCharacter());
    const [char, setChar] = useState<string | null>(getCurrentCharacter());

    const changeTab = useCallback((next: Tab) => {
        const current = scrollRefs[tab].current;
        if (current) {
            scrollPos.current[tab] = current.scrollTop;
        }
        setTab(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- scrollRefs is a ref object, doesn't need to be in deps
    }, [tab]);

    useEffect(() => {
        const showGeneral = () => changeTab("general");
        const showGuild = () => changeTab("guild");
        window.addEventListener("show-general-settings", showGeneral);
        window.addEventListener("show-guild-settings", showGuild);
        return () => {
            window.removeEventListener("show-general-settings", showGeneral);
            window.removeEventListener("show-guild-settings", showGuild);
        };
    }, [changeTab]);

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

    const registerGeneralSave = useCallback((fn: (settings: any) => void) => {
        saveRefs.current.general = fn;
    }, []);

    const registerGuildSave = useCallback((fn: (settings: any) => void) => {
        saveRefs.current.guild = fn;
    }, []);

    const registerLuaGagsSave = useCallback((fn: (settings: any) => void) => {
        saveRefs.current.luaGags = fn;
    }, []);

    const registerEnemyBindsSave = useCallback((fn: (settings: any) => void) => {
        saveRefs.current.enemyBinds = fn;
    }, []);

    const registerMagikiSave = useCallback((fn: (settings: any) => void) => {
        saveRefs.current.magiki = fn;
    }, []);

    useEffect(() => {
        const handler = async () => {
            // Read settings once at the start
            const res = await storage.getItem("settings");
            const currentSettings = res?.settings || {};

            // Each save handler updates the shared settings object
            const updated = { ...currentSettings };
            saveRefs.current.general(updated);
            saveRefs.current.guild(updated);
            saveRefs.current.luaGags(updated);
            saveRefs.current.enemyBinds(updated);
            saveRefs.current.magiki(updated);

            // Write once at the end
            await storage.setItem("settings", updated);
            window.dispatchEvent(new Event("close-options"));
        };
        window.addEventListener("save-options", handler);
        return () => window.removeEventListener("save-options", handler);
    }, []);

    useEffect(() => {
        const current = scrollRefs[tab].current;
        if (current) {
            current.scrollTop = scrollPos.current[tab];
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- scrollRefs and scrollPos are refs, don't need deps
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
            <div className="mb-3">
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                        window.dispatchEvent(new Event("close-options"));
                        setTimeout(() => window.dispatchEvent(new Event("show-export-import")), 0);
                    }}
                >
                    Eksportuj i importuj ustawienia…
                </button>
            </div>
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
                    <button
                        className={`btn btn-sm ${tab === "luaGags" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => changeTab("luaGags")}
                    >
                        Walka
                    </button>
                    <button
                        className={`btn btn-sm ${tab === "enemyBinds" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => changeTab("enemyBinds")}
                    >
                        Bindy wrogów
                    </button>
                    <button
                        className={`btn btn-sm ${tab === "magiki" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => changeTab("magiki")}
                    >
                        Magiki
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
                <div
                    ref={scrollRefs.luaGags}
                    className={`h-100 overflow-auto${tab === "luaGags" ? "" : " d-none"}`}
                    style={{ minHeight: 0 }}
                >
                    <LuaGagsSettings registerSave={registerLuaGagsSave} />
                </div>
                <div
                    ref={scrollRefs.enemyBinds}
                    className={`h-100 overflow-auto${tab === "enemyBinds" ? "" : " d-none"}`}
                    style={{ minHeight: 0 }}
                >
                    <EnemyBindsSettings registerSave={registerEnemyBindsSave} />
                </div>
                <div
                    ref={scrollRefs.magiki}
                    className={`h-100 overflow-auto${tab === "magiki" ? "" : " d-none"}`}
                    style={{ minHeight: 0 }}
                >
                    <MagikiSettings registerSave={registerMagikiSave} />
                </div>
            </div>
        </div>
    );
}

export default CharacterSettings;
