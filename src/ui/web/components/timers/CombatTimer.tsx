import { useState } from "react";
import { useClientEvent, useLocalStorage } from "../../hooks";
import type { UiSettings } from "@web/uiSettings";

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

  useClientEvent<Partial<UiSettings>>("uiSettings", (newSettings) => {
    if (newSettings && typeof newSettings.showCombatTimer === "boolean") {
      setEnabled(newSettings.showCombatTimer);
    }
  });

  // Hide if disabled or no active timer
  if (!enabled || seconds == null || seconds <= 0) {
    return null;
  }

  // Determine color class based on remaining time
  let className = "green";
  if (seconds > 20) {
    className = "red";
  } else if (seconds > 10) {
    className = "yellow";
  }

  return (
    <span className={className}>
      Walka: {seconds}
    </span>
  );
};

export default CombatTimer;
