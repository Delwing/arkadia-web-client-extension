import { useState } from "react";
import { useClientEvent } from "../../hooks";
import { requireClientInstance } from "@shared/runtime";

interface MailState {
  unread?: boolean;
  unreceived?: boolean;
  unsent?: boolean;
}

/**
 * MailStatus component - displays mail status indicators
 * Shows status from gmcp.mail.state event with 3 boolean flags
 * Sends "wyslij zwierze" command when clicked
 */
export const MailStatus: React.FC = () => {
  const [mailState, setMailState] = useState<MailState>({});

  useClientEvent<MailState>("gmcp.mail.state", (state) => {
    setMailState(state || {});
  });

  const hasAnyStatus = mailState.unreceived || mailState.unsent;

  if (!hasAnyStatus) {
    return null;
  }

  const handleClick = () => {
    const client = requireClientInstance();
    client.send("wyslij zwierze");
  };

  const statusParts: string[] = [];
  if (mailState.unreceived) {
    statusParts.push("Nowa");
  }
  if (mailState.unsent) {
    statusParts.push("Niewyslana");
  }

  return <span onClick={handleClick} style={{ cursor: "pointer", color: "orange" }}>✉: {statusParts.join(", ")}</span>;
};

export default MailStatus;
