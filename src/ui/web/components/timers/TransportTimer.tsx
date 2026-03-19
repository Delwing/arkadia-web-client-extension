import { useState, useEffect, useCallback } from "react";
import { useClientEvent, useLocalStorage } from "../../hooks";
import type { UiSettings } from "@web/uiSettings";
import {TransportTimerPayload} from "@client/types/transport.ts";
import {globalStorage} from "@modules/core/storage";
import eventBus from "@modules/core/eventBus";

/**
 * TransportTimer component - displays transport timer with label
 * Shows "Tr: [label] M:SS" with color based on remaining time
 * Color: red (<10s), yellow (<30s), green (>=30s)
 * Can be toggled via UI settings
 */
export const TransportTimer: React.FC = () => {
  const [payload, setPayload] = useState<TransportTimerPayload | null>(null);
  const [uiSettings] = useLocalStorage<Partial<UiSettings>>("uiSettings", {});
  const [showTransportLabel, setShowTransportLabel] = useState(true);

  // Sync showTransportLabel with uiSettings from localStorage
  useEffect(() => {
    setShowTransportLabel(uiSettings.showTransportLabel ?? true);
  }, [uiSettings.showTransportLabel]);

  useClientEvent<TransportTimerPayload | null>("transportTimer", (newPayload) => {
    setPayload(newPayload);
  });

  const handleClick = useCallback(() => {
    eventBus.emit("transport.popup.open");
  }, []);

  useEffect(() => {
    const container = document.getElementById("transport-timer");
    if (!container) return;
    container.style.cursor = "pointer";
    container.title = "Kliknij aby otworzyc trase";
    container.onclick = handleClick;
  }, [handleClick]);

  useEffect(() => {
    return globalStorage.onChange('uiSettings', (newSettings) => {
      if (newSettings && typeof newSettings.showTransportLabel === "boolean") {
        setShowTransportLabel(newSettings.showTransportLabel);
      }
    });
  }, []);

  // Update the container's className based on timer state
  useEffect(() => {
    const container = document.getElementById("transport-timer");
    if (!container) return;

    if (!showTransportLabel || !payload) {
      container.className = "";
      return;
    }

    const hasTimer =
      typeof payload.remaining === "number" && typeof payload.total === "number";

    if (hasTimer) {
      const remaining = Math.max(0, payload.remaining!);
      if (remaining < 10) {
        container.className = "red";
      } else if (remaining < 30) {
        container.className = "yellow";
      } else {
        container.className = "green";
      }
    } else {
      container.className = "green"; // Default to green when no timer
    }
  }, [showTransportLabel, payload]);

  // Hide if disabled or no payload
  if (!showTransportLabel || !payload) {
    return null;
  }

  const hasTimer =
    typeof payload.remaining === "number" && typeof payload.total === "number";

  // Build display parts
  const labelPart = payload.label;
  let timerPart = "";

  if (hasTimer) {
    const remaining = Math.max(0, payload.remaining!);
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    const secondsText = seconds.toString().padStart(2, "0");
    timerPart = ` ${minutes}:${secondsText}`;
  }

  return (
    <>
      <span style={{ color: "white" }}>Tr: </span>
      {labelPart}
      {timerPart}
    </>
  );
};

export default TransportTimer;
