import { useState, useEffect, useRef } from "react";
import GeneralSettings from "./Settings";
import Guilds from "./Guilds";

type Tab = "general" | "guild";

function CharacterSettings() {
    const [tab, setTab] = useState<Tab>("general");
    const saveRef = useRef<() => void>(() => {});

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

    function registerSave(fn: () => void) {
        saveRef.current = fn;
    }

    function save() {
        saveRef.current();
    }

    return (
        <div className="p-2 d-flex flex-column h-100">
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
            <div className="flex-grow-1 overflow-auto">
                {tab === "general" ? (
                    <GeneralSettings registerSave={registerSave} />
                ) : (
                    <Guilds registerSave={registerSave} />
                )}
            </div>
            <div className="pt-2 flex-shrink-0">
                <button className="btn btn-primary" onClick={save}>
                    Zapisz
                </button>
            </div>
        </div>
    );
}

export default CharacterSettings;
