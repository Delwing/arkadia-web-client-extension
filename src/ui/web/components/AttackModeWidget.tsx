import { useCallback, useEffect, useState } from "react";
import eventBus from "../../../../client/src/eventBus";
import { getItemSync } from "../../../../client/src/storage";

const MODES = ["A", "AW", "AWR"] as const;
type Mode = (typeof MODES)[number];

const isMode = (value: unknown): value is Mode =>
    typeof value === "string" && (MODES as readonly string[]).includes(value);

const AttackModeWidget = () => {
    const [mode, setMode] = useState<Mode>(() => {
        const stored = getItemSync("attack_mode")?.attack_mode;
        return isMode(stored) ? stored : "A";
    });
    const [isLeader, setIsLeader] = useState(false);

    useEffect(() => {
        const unsubscribeAttackMode = eventBus.on("attackMode", (nextMode) => {
            if (isMode(nextMode)) {
                setMode(nextMode);
            }
        });
        const unsubscribeLeader = eventBus.on("isTeamLeader", (flag) => {
            setIsLeader(Boolean(flag));
        });

        eventBus.emit("attackMode", mode);

        return () => {
            unsubscribeAttackMode();
            unsubscribeLeader();
        };
    }, []);

    const handleClick = useCallback(() => {
        if (!isLeader) return;
        setMode((current) => {
            const currentIndex = MODES.indexOf(current);
            const nextMode = MODES[(currentIndex + 1) % MODES.length];
            eventBus.emit("attackMode", nextMode);
            return nextMode;
        });
    }, [isLeader]);

    const display = isLeader ? "block" : "none";
    const className = isLeader ? mode : "";

    return (
        <span id="attack-mode" className={className} style={{ display }} onClick={handleClick}>
            <span className="attack-mode__label">{`Atk: ${mode}`}</span>
        </span>
    );
};

export default AttackModeWidget;
