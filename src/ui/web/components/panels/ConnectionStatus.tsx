import { useEffect, useRef, useState } from "react";
import { useClientEvent } from "../../hooks";

/**
 * ConnectionStatus - round-trip time to the game and, on the session proxy, how far
 * that proxy's clock sits from ours.
 *
 * Both numbers are diagnostics rather than gameplay, which is why this is off by
 * default. The drift is the interesting one: frame timestamps are the proxy's wall
 * clock and every event time in the client is derived from them, so a proxy running
 * fast used to inflate timers by exactly its skew (a 5s cover cooldown counting down
 * from 10) with nothing anywhere reporting a fault. MudClient corrects for it now,
 * and this is where you can see what it is correcting.
 */
export const ConnectionStatus: React.FC = () => {
  const [ping, setPing] = useState<number | null>(null);
  const [offset, setOffset] = useState<number | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  useClientEvent<number | null>("ping", (value) => {
    setPing(typeof value === "number" ? value : null);
  });

  // Only the session proxy emits this, so a direct or helper connection simply never
  // shows the drift half.
  useClientEvent<number>("proxy.clockOffset", (value) => {
    setOffset(typeof value === "number" ? value : null);
  });

  useEffect(() => {
    containerRef.current = document.getElementById("connection-status");
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const parts: string[] = [];
    if (ping != null) {
      // Ping and proxy drift both RANK -- good / middling / bad -- so they are
      // status, not categorical data. That is the call the Phase 3 audit of the
      // sixteen --popup-data-* variables made for this exact triple
      // (spring-green / yellow / tomato); these two footer chips were the last
      // readers of it outside popups-base.css.
      const color = ping < 150
        ? "var(--ark-success-text)"
        : ping < 400 ? "var(--ark-warning-text)" : "var(--ark-danger-text)";
      parts.push(`<span>Ping: </span><span style="color: ${color};">${Math.round(ping)}ms</span>`);
    }
    if (offset != null) {
      const drift = offset / 1000;
      // Under half a second is the network delay this is measured through, not a
      // clock anyone needs to fix, so it stays dim rather than shouting.
      const color = Math.abs(offset) >= 2000
        ? "var(--ark-danger-text)"
        : Math.abs(offset) >= 500 ? "var(--ark-warning-text)" : "var(--ark-text-tertiary)";
      const sign = drift >= 0 ? "+" : "";
      parts.push(`<span>Proxy: </span><span style="color: ${color};" title="Zegar proxy wzgledem tego komputera">${sign}${drift.toFixed(1)}s</span>`);
    }

    containerRef.current.innerHTML = parts.join('<span> </span>');
    containerRef.current.style.display = parts.length > 0 ? "block" : "none";
  }, [ping, offset]);

  return null;
};

export default ConnectionStatus;
