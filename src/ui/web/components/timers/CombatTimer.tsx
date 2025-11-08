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
      containerRef.current.textContent = "";
      containerRef.current.className = "";
      containerRef.current.style.display = "none";
      return;
    }

    containerRef.current.style.display = "block";
    containerRef.current.textContent = `Walka: ${seconds}`;

    // Determine color class based on remaining time
    if (seconds > 20) {
      containerRef.current.className = "red";
    } else if (seconds > 10) {
      containerRef.current.className = "yellow";
    } else {
      containerRef.current.className = "green";
    }
  }, [enabled, seconds]);

  return null;
};

export default CombatTimer;
