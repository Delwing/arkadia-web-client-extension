import { useState, useEffect, useRef } from "react";
import { useClientEvent } from "../../hooks";
import eventBus from "@modules/core/eventBus";

/**
 * ReleaseGuard component - toggle button for release guard state
 * Shows "Pusc zas: on/off" and toggles state on click
 *
 * Note: This component manipulates the container element directly to match
 * the behavior of the old class-based implementation.
 */
export const ReleaseGuard: React.FC = () => {
  const [state, setState] = useState(true);
  const containerRef = useRef<HTMLElement | null>(null);

  useClientEvent<boolean>("releaseGuard", (newState) => {
    setState(newState);
  });

  // Get reference to the container element
  useEffect(() => {
    containerRef.current = document.getElementById("release-guard");
  }, []);

  // Set up click handler
  useEffect(() => {
    if (!containerRef.current) return;

    const handleClick = () => {
      eventBus.emit("releaseGuard", !state);
    };

    containerRef.current.addEventListener("click", handleClick);

    return () => {
      containerRef.current?.removeEventListener("click", handleClick);
    };
  }, [state]);

  // Update the container element's properties
  useEffect(() => {
    if (!containerRef.current) return;

    containerRef.current.innerHTML = `<span style="color: white">Pusc zas: </span>${state ? "on" : "off"}`;
    containerRef.current.className = state ? "on" : "off";
    containerRef.current.style.display = "block";
  }, [state]);

  return null;
};

export default ReleaseGuard;
