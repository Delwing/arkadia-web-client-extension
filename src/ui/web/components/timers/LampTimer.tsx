import { useState, useEffect } from "react";
import { useClientEvent } from "../../hooks";

/**
 * LampTimer component - displays remaining time for lamp
 * Color-coded: red (<30s), yellow (<60s), green (>=60s)
 */
export const LampTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null);

  useClientEvent<number | null>("lampTimer", (newSeconds) => {
    setSeconds(newSeconds);
  });

  // Update the container's className based on timer state
  useEffect(() => {
    const container = document.getElementById("lamp-timer");
    if (!container) return;

    if (seconds == null || seconds <= 0) {
      container.className = "";
      return;
    }

    // Determine color class based on remaining time
    if (seconds < 30) {
      container.className = "red";
    } else if (seconds < 60) {
      container.className = "yellow";
    } else {
      container.className = "green";
    }
  }, [seconds]);

  // Hide if null or <= 0
  if (seconds == null || seconds <= 0) {
    return null;
  }

  // Format time as M:SS
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeText = `lamp ${minutes}:${secs.toString().padStart(2, "0")}`;

  return <>{timeText}</>;
};

export default LampTimer;
