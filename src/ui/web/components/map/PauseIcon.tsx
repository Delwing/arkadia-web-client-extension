import { useState } from "react";
import { useClientEvent } from "../../hooks";

export const PauseIcon = () => {
    const [visible, setVisible] = useState(false);

    useClientEvent("pauserStart", () => {
        setVisible(true);
    });

    useClientEvent("pauserEnd", () => {
        setVisible(false);
    });

    if (!visible) {
        return null;
    }

    return <>⏸</>;
};
