import { useState } from "react";
import { useClientEvent, useClientCommand } from "../../hooks";

interface TeamPanelStatus {
    teamSize: number;
    missing: string[];
}

/**
 * TeamPanel component - summarises the team's presence on the current location.
 * Shows green "Wszyscy sa [N]" when every member is here, or yellow "Brakuje: ..."
 * listing the missing ones. Clicking sends the "druzyna" command. Hidden when the
 * character is not in a team.
 */
export const TeamPanel: React.FC = () => {
    const [status, setStatus] = useState<TeamPanelStatus>({ teamSize: 0, missing: [] });
    const sendCommand = useClientCommand();

    useClientEvent<TeamPanelStatus>("teamPanelStatus", (next) => {
        setStatus(next && typeof next.teamSize === "number" ? next : { teamSize: 0, missing: [] });
    });

    if (status.teamSize === 0) {
        return null;
    }

    const allHere = status.missing.length === 0;

    return (
        <span
            onClick={() => sendCommand("druzyna")}
            title="Kliknij, aby wyswietlic sklad druzyny"
            style={{ cursor: "pointer" }}
        >
            {allHere ? (
                <span style={{ color: "#32cd32" }}>Wszyscy sa [{status.teamSize}]</span>
            ) : (
                <>
                    Brakuje: <span style={{ color: "#ffff00" }}>{status.missing.join(", ")}</span>
                </>
            )}
        </span>
    );
};

export default TeamPanel;
