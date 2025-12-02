import { useState } from "react";
import { useClientEvent } from "../../hooks";

export const LocationLabel = () => {
    const [label, setLabel] = useState("");

    useClientEvent("mapLocationLabel", (text: string) => {
        setLabel(text);
    });

    return <>{label}</>;
};
