import {useCallback, useState, useEffect, useRef} from "react";
import eventBus from "@modules/core/eventBus";
import {useClientEvent, useLocalStorage} from "../../hooks";

const MODES = ["A", "AW", "AWR"] as const;
type Mode = (typeof MODES)[number];

const isMode = (value: unknown): value is Mode =>
    typeof value === "string" && (MODES as readonly string[]).includes(value);

/**
 * AttackMode component - displays attack mode indicator when player is team leader
 * Shows "Atk: A/AW/AWR" and allows cycling through modes on click
 *
 * Note: This component manipulates the container element directly to match
 * the behavior expected by the CSS (#attack-mode.A, #attack-mode.AW, #attack-mode.AWR)
 */
export const AttackMode = () => {
    const [attack_mode] = useLocalStorage<Partial<Mode>>("attack_mode", "A");
    const [mode, setMode] = useState<Mode>(() => {
        const stored = attack_mode
        return isMode(stored) ? stored : "A";
    });

    const [isLeader, setIsLeader] = useState(false);
    const containerRef = useRef<HTMLElement | null>(null);

    useClientEvent("isTeamLeader", (flag) => {
        setIsLeader(Boolean(flag));
    });

    useClientEvent("attackMode", (nextMode) => {
        if (isMode(nextMode)) {
            setMode(nextMode);
        }
    })

    // Get reference to the container element
    useEffect(() => {
        containerRef.current = document.getElementById("attack-mode");
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

    // Set up click handler
    useEffect(() => {
        if (!containerRef.current) return;

        containerRef.current.addEventListener("click", handleClick);

        return () => {
            containerRef.current?.removeEventListener("click", handleClick);
        };
    }, [handleClick]);

    // Update the container element's properties
    useEffect(() => {
        if (!containerRef.current) return;

        if (!isLeader) {
            containerRef.current.style.display = "none";
            containerRef.current.className = "";
            containerRef.current.innerHTML = "";
            return;
        }

        containerRef.current.style.display = "inline";
        containerRef.current.className = mode;
        containerRef.current.innerHTML = `Atk: ${mode}`;
        containerRef.current.style.cursor = "pointer";
    }, [isLeader, mode]);

    return null;
};
