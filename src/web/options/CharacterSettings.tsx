import { useState, useEffect, useRef, useCallback } from "react";
import { characterStorage } from "@modules/core/storage";
import type { Settings } from "@modules/core/defaultSettings";
import GeneralSettings from "./Settings";
import GuildsSettings from "./GuildsSettings";
import LuaGagsSettings from "./LuaGagsSettings";
import EnemyBindsSettings from "./EnemyBindsSettings";
import MagikiSettings from "./MagikiSettings";
import ShortExitsSettings from "./ShortExitsSettings";

type Tab = "general" | "guild" | "luaGags" | "enemyBinds" | "magiki" | "shortExits";

function CharacterSettings() {
    const [tab, setTab] = useState<Tab>("general");
    const scrollRefs = {
        general: useRef<HTMLDivElement>(null),
        guild: useRef<HTMLDivElement>(null),
        luaGags: useRef<HTMLDivElement>(null),
        enemyBinds: useRef<HTMLDivElement>(null),
        magiki: useRef<HTMLDivElement>(null),
        shortExits: useRef<HTMLDivElement>(null),
    } as const;
    const scrollPos = useRef<Record<Tab, number>>({ general: 0, guild: 0, luaGags: 0, enemyBinds: 0, magiki: 0, shortExits: 0 });
    const saveRefs = useRef<Record<Tab, (settings: any) => void>>({ general: () => {}, guild: () => {}, luaGags: () => {}, enemyBinds: () => {}, magiki: () => {}, shortExits: () => {} });
    const [locked, setLocked] = useState(!characterStorage.getCharacter());
    const [char, setChar] = useState<string | null>(characterStorage.getCharacter());

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
            const current = characterStorage.getCharacter();
            setLocked(!current);
            setChar(current);
        };
        return characterStorage.onCharacterChange(update);
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

    const registerShortExitsSave = useCallback((fn: (settings: any) => void) => {
        saveRefs.current.shortExits = fn;
    }, []);

    useEffect(() => {
        const handler = () => {
            // Read settings once at the start
            const currentSettings = characterStorage.get("settings") ?? {} as Settings;

            // Each save handler updates the shared settings object
            const updated = { ...currentSettings };
            saveRefs.current.general(updated);
            saveRefs.current.guild(updated);
            saveRefs.current.luaGags(updated);
            saveRefs.current.enemyBinds(updated);
            saveRefs.current.magiki(updated);
            saveRefs.current.shortExits(updated);

            // Write once at the end
            characterStorage.set("settings", updated);
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
                <div className="alert alert-info py-2" role="alert">
                    Opcje zależne od postaci są zablokowane do momentu jej wybrania.
                </div>
            ) : (
                char && (
                    <div className="alert alert-info py-2" role="alert">
                        Ustawienia dotyczą postaci: <strong>{char.charAt(0).toUpperCase() + char.slice(1).toLowerCase()}</strong>
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
                    <button
                        className={`btn btn-sm ${tab === "shortExits" ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => changeTab("shortExits")}
                    >
                        Wyjścia
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
                <div
                    ref={scrollRefs.shortExits}
                    className={`h-100 overflow-auto${tab === "shortExits" ? "" : " d-none"}`}
                    style={{ minHeight: 0 }}
                >
                    <ShortExitsSettings registerSave={registerShortExitsSave} />
                </div>
            </div>
        </div>
    );
}

export default CharacterSettings;
