import { useState, useEffect } from "react";
import { useClientEvent } from "../../hooks";
import eventBus from "@modules/core/eventBus";

/**
 * LampTimer component - displays remaining time for lamp
 * Color-coded: red (<30s), yellow (<60s), green (>=60s)
 * Click to refill lamp
 */
export const LampTimer: React.FC = () => {
  const [seconds, setSeconds] = useState<number | null>(null);

  useClientEvent<number | null>("lampTimer", (newSeconds) => {
    setSeconds(newSeconds);
  });

  useEffect(() => {
    const container = document.getElementById("lamp-timer");
    if (!container) return;

    if (seconds == null || seconds <= 0) {
      container.className = "";
      return;
    }

    if (seconds < 30) {
      container.className = "red";
    } else if (seconds < 60) {
      container.className = "yellow";
    } else {
      container.className = "green";
    }
  }, [seconds]);

  const handleClick = () => {
    eventBus.emit("sendCommand", { command: "napelnij lampe olejem" });
  };

  if (seconds == null || seconds <= 0) {
    return null;
  }

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const timeValue = `${minutes}:${secs.toString().padStart(2, "0")}`;

  return (
    <>
      <span style={{ color: "white", cursor: "pointer" }} onClick={handleClick}>
        lamp{" "}
      </span>
      <span style={{ cursor: "pointer" }} onClick={handleClick}>
        {timeValue}
      </span>
    </>
  );
};

export default LampTimer;
