import { useState, useEffect, useRef } from "react";
import { useClientEvent } from "../../hooks";

/**
 * WorldDestructionTimer component - displays countdown to world destruction
 * Shows remaining time in MM:SS format when active, hidden when inactive
 */
export const WorldDestructionTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  useClientEvent<number | null>("worldDestructionTimer", (newSeconds) => {
    setSeconds(newSeconds);
  });

  // Get reference to the container element
  useEffect(() => {
    containerRef.current = document.getElementById("world-destruction-timer");
  }, []);

  // Update the container element's properties
  useEffect(() => {
    if (!containerRef.current) return;

    const isActive = seconds != null && seconds > 0;

    if (isActive) {
      const totalSeconds = Math.ceil(seconds);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      containerRef.current.innerHTML = `<span style="color: red; font-weight: bold;">Apokalipsa: ${timeStr}</span>`;
      containerRef.current.style.display = "inline";
    } else {
      containerRef.current.innerHTML = "";
      containerRef.current.style.display = "none";
    }
  }, [seconds]);

  return null;
};

export default WorldDestructionTimer;
