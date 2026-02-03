import {useState} from "react";
import {useClientEvent} from "../../hooks";
import {PackageStatus as PackageStatusEvent} from "../../../../shared/events";
import eventBus from "@modules/core/eventBus";

const formatLabel = (status: PackageStatusEvent): string => {
    let label = `📦: ${status.recipient}`;
    if (typeof status.seconds === "number" && status.seconds > 0) {
        const minutes = Math.floor(status.seconds / 60);
        const remainderSeconds = status.seconds % 60;
        label += ` ${minutes}:${remainderSeconds.toString().padStart(2, "0")}`;
    }
    return label;
};

export const PackageStatus = () => {
    const [status, setStatus] = useState<PackageStatusEvent | null>(null);

    useClientEvent("packageStatus", (newStatus) => {
        setStatus(newStatus);
    });

    if (!status) {
        return null
    }

    const handleClick = () => {
        if (status.location) {
            eventBus.emit("leadTo", status.location);
        }
    };

    const label = formatLabel(status);
    const clickable = !!status.location;

    return (
        <span onClick={handleClick} style={clickable ? { cursor: "pointer" } : undefined}>
            {label}
        </span>
    );
};
