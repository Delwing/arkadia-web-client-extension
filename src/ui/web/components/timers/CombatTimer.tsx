import { useState, useEffect, useRef } from "react";
import { useClientEvent, useLocalStorage } from "../../hooks";
import type { UiSettings } from "@web/uiSettings";

/**
 * CombatTimer component - displays combat timer
 * Shows "Walka: X" with color based on remaining seconds
 * Color: red (>20s), yellow (>10s), green (<=10s)
 * Can be toggled via UI settings
 *
 * Note: This component manipulates the container element directly to match
 * the behavior of the old class-based implementation.
 */
export const CombatTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [uiSettings] = useLocalStorage<Partial<UiSettings>>("uiSettings", {});
  const [enabled, setEnabled] = useState(() => uiSettings.showCombatTimer ?? true);
  const containerRef = useRef<HTMLElement | null>(null);

  useClientEvent<number | null>("combatTimer", (newSeconds) => {
    setSeconds(newSeconds);
  });

  useClientEvent<Partial<UiSettings>>("uiSettings", (newSettings) => {
    if (newSettings && typeof newSettings.showCombatTimer === "boolean") {
      setEnabled(newSettings.showCombatTimer);
    }
  });

  // Get reference to the container element
  useEffect(() => {
    containerRef.current = document.getElementById("combat-timer");
  }, []);

  // Update the container element's properties
  useEffect(() => {
    if (!containerRef.current) return;

    // Hide if disabled or no active timer
    if (!enabled || seconds == null || seconds <= 0) {
      containerRef.current.innerHTML = "";
      containerRef.current.style.display = "none";
      return;
    }

    // Determine color based on remaining time
    let color = "springgreen";
    if (seconds > 20) {
      color = "tomato";
    } else if (seconds > 10) {
      color = "yellow";
    }

    containerRef.current.style.display = "block";
    containerRef.current.innerHTML = `<span style="color: white;">Walka: </span><span style="color: ${color};">${seconds}</span>`;
  }, [enabled, seconds]);

  return null;
};

export default CombatTimer;
