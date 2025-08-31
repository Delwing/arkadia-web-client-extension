import { useState, useEffect } from "react";
import GeneralSettings from "./Settings";
import Guilds from "./Guilds";

type Tab = "general" | "guild";

function CharacterSettings() {
    const [tab, setTab] = useState<Tab>("general");

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

    return (
        <div className="p-2">
            <div className="d-flex gap-2 mb-3">
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
            {tab === "general" ? <GeneralSettings /> : <Guilds />}
        </div>
    );
}

export default CharacterSettings;
