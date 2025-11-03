import { useState } from "react";
import { useClientEvent, useLocalStorage } from "../../hooks";
import type { UiSettings } from "@web/uiSettings";
import {TransportTimerPayload} from "@client/types/transport.ts";

/**
 * TransportTimer component - displays transport timer with label
 * Shows "Tr: [label] M:SS" with color based on remaining time
 * Color: red (<10s), yellow (<30s), green (>=30s)
 * Can be toggled via UI settings
 */
export const TransportTimer: React.FC = () => {
  const [payload, setPayload] = useState<TransportTimerPayload | null>(null);
  const [uiSettings] = useLocalStorage<Partial<UiSettings>>("uiSettings", {});
  const [showTransportLabel, setShowTransportLabel] = useState(
    () => uiSettings.showTransportLabel ?? true
  );

  useClientEvent<TransportTimerPayload | null>("transportTimer", (newPayload) => {
    setPayload(newPayload);
  });

  useClientEvent<Partial<UiSettings>>("uiSettings", (newSettings) => {
    if (newSettings && typeof newSettings.showTransportLabel === "boolean") {
      setShowTransportLabel(newSettings.showTransportLabel);
    }
  });

  // Hide if disabled or no payload
  if (!showTransportLabel || !payload) {
    return null;
  }

  const hasTimer =
    typeof payload.remaining === "number" && typeof payload.total === "number";

  // Build display parts
  const parts = ["Tr:"];
  if (showTransportLabel) {
    parts.push(payload.label);
  }

  let className = "";
  if (hasTimer) {
    const remaining = Math.max(0, payload.remaining!);
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    const secondsText = seconds.toString().padStart(2, "0");
    parts.push(`${minutes}:${secondsText}`);

    // Determine color class
    if (remaining < 10) {
      className = "red";
    } else if (remaining < 30) {
      className = "yellow";
    } else {
      className = "green";
    }
  }

  return (
    <span className={className}>
      {parts.join(" ")}
    </span>
  );
};

export default TransportTimer;
