import { useState } from "react";
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

  // Hide if null or <= 0
  if (seconds == null || seconds <= 0) {
    return null;
  }

  // Format time as M:SS
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeText = `lamp ${minutes}:${secs.toString().padStart(2, "0")}`;

  // Determine color class based on remaining time
  let className = "green";
  if (seconds < 30) {
    className = "red";
  } else if (seconds < 60) {
    className = "yellow";
  }

  return (
    <span className={className}>
      {timeText}
    </span>
  );
};

export default LampTimer;
