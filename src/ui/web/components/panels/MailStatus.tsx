import { useState } from "react";
import { useClientEvent, useClientCommand, useAttentionBlink } from "../../hooks";

interface MailState {
  unread?: boolean;
  unreceived?: boolean;
  unsent?: boolean;
}

/**
 * MailStatus component - displays mail status indicators
 * Shows status from gmcp.mail.state event with 3 boolean flags
 * Sends "wyslij zwierze" command when clicked
 * Blinks for 5s when it appears, then for 5s every minute while it stays
 */
export const MailStatus: React.FC = () => {
  const [mailState, setMailState] = useState<MailState>({});
  const sendCommand = useClientCommand();

  useClientEvent<MailState>("gmcp.mail.state", (state) => {
    setMailState(state || {});
  });

  const hasAnyStatus = Boolean(mailState.unreceived || mailState.unsent);
  const blinking = useAttentionBlink(hasAnyStatus);

  if (!hasAnyStatus) {
    return null;
  }

  const handleClick = () => {
    sendCommand("wyslij zwierze");
  };

  const statusParts: string[] = [];
  if (mailState.unreceived) {
    statusParts.push("Nowa");
  }
  if (mailState.unsent) {
    statusParts.push("Niewyslana");
  }

  return <span className={blinking ? "attention-blink" : undefined} onClick={handleClick} style={{ cursor: "pointer", color: "orange" }}>✉: {statusParts.join(", ")}</span>;
};

export default MailStatus;
