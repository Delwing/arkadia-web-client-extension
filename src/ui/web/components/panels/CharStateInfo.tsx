import { useState } from "react";
import { useClientEvent } from "../../hooks";

/**
 * CharStateInfo component - displays character state information
 * Shows text from gmcp.char.state event, hides when empty
 */
export const CharStateInfo: React.FC = () => {
  const [stateText, setStateText] = useState<string>("");

  useClientEvent<any>("gmcp.char.state", (state) => {
    const text = typeof state?.state === "string" ? state.state : "";
    setStateText(text);
  });

  if (!stateText) {
    return null;
  }

  return <span>{stateText}</span>;
};

export default CharStateInfo;
