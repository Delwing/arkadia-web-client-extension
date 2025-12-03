import { useEffect, useState } from "react";
import { useClientEvent } from "../../hooks";
import eventBus from "@modules/core/eventBus";

export const LocationLabel = () => {
    const [label, setLabel] = useState("");

    useClientEvent("mapLocationLabel", (text: string) => {
        setLabel(text);
    });

    // Fetch the current location label when component mounts
    useEffect(() => {
        // Request the current state to be emitted
        eventBus.emit("requestMapLocationLabel");
    }, []);

    return <>{label}</>;
};
