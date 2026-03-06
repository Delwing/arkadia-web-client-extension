import { useState, useEffect } from "react";
import { useClientEvent, useLocalStorage } from "../../hooks";
import type { UiSettings } from "@web/uiSettings";
import {globalStorage} from "@modules/core/storage";

/**
 * CombatTimer component - displays combat timer
 * Shows "Walka: X" with color based on remaining seconds
 * Color: red (>20s), yellow (>10s), green (<=10s)
 * Can be toggled via UI settings
 */
export const CombatTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [uiSettings] = useLocalStorage<Partial<UiSettings>>("uiSettings", {});
  const [enabled, setEnabled] = useState(() => uiSettings.showCombatTimer ?? true);

  useClientEvent<number | null>("combatTimer", (newSeconds) => {
    setSeconds(newSeconds);
  });

  useEffect(() => {
    return globalStorage.onChange('uiSettings', (newSettings) => {
      if (newSettings && typeof newSettings.showCombatTimer === "boolean") {
        setEnabled(newSettings.showCombatTimer);
      }
    });
  }, []);

  const isVisible = enabled && seconds != null && seconds > 0;

  useEffect(() => {
    const container = document.getElementById("combat-timer");
    if (!container) return;

    if (!isVisible) {
      container.className = "";
      return;
    }

    if (seconds! > 20) {
      container.className = "red";
    } else if (seconds! > 10) {
      container.className = "yellow";
    } else {
      container.className = "green";
    }
  }, [isVisible, seconds]);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <span style={{ color: "white" }}>Walka: </span>
      <span>{seconds}</span>
    </>
  );
};

export default CombatTimer;
