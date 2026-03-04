import { useState, useEffect } from "react";
import { useClientEvent } from "../../hooks";

/**
 * WorldDestructionTimer component - displays countdown to world destruction
 * Shows remaining time in MM:SS format when active, hidden when inactive
 */
export const WorldDestructionTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null);

  useClientEvent<number | null>("worldDestructionTimer", (newSeconds) => {
    setSeconds(newSeconds);
  });

  const isActive = seconds != null && seconds > 0;

  useEffect(() => {
    const container = document.getElementById("world-destruction-timer");
    if (!container) return;
    container.className = isActive ? "active" : "";
  }, [isActive]);

  if (!isActive) {
    return null;
  }

  const totalSeconds = Math.ceil(seconds!);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  return <>Apokalipsa: {timeStr}</>;
};

export default WorldDestructionTimer;
