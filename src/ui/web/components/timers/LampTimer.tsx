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

  // Update the container's display and content
  useEffect(() => {
    const container = document.getElementById("lamp-timer");
    if (!container) return;

    if (seconds == null || seconds <= 0) {
      container.style.display = "none";
      container.innerHTML = "";
      return;
    }

    // Format time as M:SS
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const timeValue = `${minutes}:${secs.toString().padStart(2, "0")}`;

    // Determine color based on remaining time
    let color = "springgreen";
    if (seconds < 30) {
      color = "tomato";
    } else if (seconds < 60) {
      color = "yellow";
    }

    container.style.display = "block";
    container.innerHTML = `<span style="color: white;">lamp </span><span style="color: ${color};">${timeValue}</span>`;
  }, [seconds]);

  return null;
};

export default LampTimer;
