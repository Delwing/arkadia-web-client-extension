import { useState, useEffect, useRef } from "react";
import { useClientEvent } from "../../hooks";
import eventBus from "@modules/core/eventBus";

/**
 * ReleaseGuardTimer component - combines release guard toggle with cover timer
 * Single surface showing: "[toggle] Zas: OK/timer"
 * Toggle switches between on (springgreen) and off (tomato)
 * Timer shows OK (green) or countdown value (yellow)
 */
export const ReleaseGuardTimer: React.FC = () => {
  const [guardState, setGuardState] = useState(true);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  useClientEvent<boolean>("releaseGuard", (newState) => {
    setGuardState(newState);
  });

  useClientEvent<number | null>("coverTimer", (newSeconds) => {
    setTimerSeconds(newSeconds);
  });

  // Use ref to track current guard state for event handler
  const guardStateRef = useRef(guardState);
  useEffect(() => {
    guardStateRef.current = guardState;
  }, [guardState]);

  // Get reference to the container element and set up click handler once
  useEffect(() => {
    containerRef.current = document.getElementById("release-guard-timer");
    if (!containerRef.current) return;

    // Click anywhere on the element to toggle guard state
    const handleClick = () => {
      eventBus.emit("releaseGuard", !guardStateRef.current);
    };

    containerRef.current.addEventListener("click", handleClick);

    return () => {
      containerRef.current?.removeEventListener("click", handleClick);
    };
  }, []);

  // Update the container element's properties
  useEffect(() => {
    if (!containerRef.current) return;

    const isTimerActive = timerSeconds != null && timerSeconds > 0;
    const guardColor = guardState ? "white" : "dimgray";

    let timerHtml: string;
    if (isTimerActive) {
      timerHtml = `<span style="color: yellow;">${timerSeconds.toFixed(2)}</span>`;
    } else {
      timerHtml = `<span style="color: springgreen;">OK</span>`;
    }

    containerRef.current.innerHTML =
      `<span style="color: ${guardColor};">Pusc</span>` +
      `<span style="color: white;"> Zas: </span>${timerHtml}`;

    containerRef.current.style.display = "block";
    containerRef.current.style.cursor = "pointer";
  }, [guardState, timerSeconds]);

  return null;
};

export default ReleaseGuardTimer;
