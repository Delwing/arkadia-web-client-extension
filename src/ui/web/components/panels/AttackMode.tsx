import {useCallback, useState} from "react";
import eventBus from "../../../../../client/src/eventBus";
import {useClientEvent, useLocalStorage} from "../../hooks";

const MODES = ["A", "AW", "AWR"] as const;
type Mode = (typeof MODES)[number];

const isMode = (value: unknown): value is Mode =>
    typeof value === "string" && (MODES as readonly string[]).includes(value);

export const AttackMode = () => {
    const [attack_mode] = useLocalStorage<Partial<Mode>>("attack_mode", "A");
    const [mode, setMode] = useState<Mode>(() => {
        const stored = attack_mode
        return isMode(stored) ? stored : "A";
    });

    const [isLeader, setIsLeader] = useState(false);

    useClientEvent("isTeamLeader", (flag) => {
        setIsLeader(Boolean(flag));
    });

    useClientEvent("attackMode", (nextMode) => {
        if (isMode(nextMode)) {
            setMode(nextMode);
        }
    })

    const handleClick = useCallback(() => {
        if (!isLeader) return;
        setMode((current) => {
            const currentIndex = MODES.indexOf(current);
            const nextMode = MODES[(currentIndex + 1) % MODES.length];
            eventBus.emit("attackMode", nextMode);
            return nextMode;
        });
    }, [isLeader]);

    if (!isLeader) return null;
    const className = isLeader ? mode : "";

    return (
        <span className={className} onClick={handleClick}>{`Atk: ${mode}`}</span>
    );
};
