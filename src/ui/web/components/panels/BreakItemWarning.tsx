import { useState } from "react";
import { useClientEvent } from "../../hooks";
import { requireClientInstance } from "@shared/runtime";

interface BreakItemData {
  text: string;
  command?: string;
}

/**
 * BreakItemWarning component - displays clickable warning for item breakage
 * Executes command and dismisses warning on click
 */
export const BreakItemWarning: React.FC = () => {
  const [data, setData] = useState<BreakItemData | null>(null);

  useClientEvent<BreakItemData | null>("breakItem", (newData) => {
    setData(newData);
  });

  const handleClick = () => {
    if (data?.command) {
      const client = requireClientInstance();
      client.send(data.command);
    }
    setData(null);
  };

  if (!data) {
    return null;
  }

  return (
    <span onClick={handleClick}>
      {data.text}
    </span>
  );
};

export default BreakItemWarning;
