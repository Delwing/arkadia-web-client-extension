import { useEffect, useState } from "react";
import eventBus from "../../../../client/src/eventBus";
import type { PackageStatus as PackageStatusEvent } from "../../../shared/events";

const normalizeStatus = (payload: PackageStatusEvent | null): PackageStatusEvent | null => {
    if (!payload) {
        return null;
    }
    const { recipient, seconds } = payload;
    if (typeof recipient !== "string" || recipient.length === 0) {
        return null;
    }
    return {
        recipient,
        ...(typeof seconds === "number" && seconds > 0 ? { seconds } : {}),
    };
};

const formatLabel = (status: PackageStatusEvent): string => {
    let label = `📦: ${status.recipient}`;
    if (typeof status.seconds === "number" && status.seconds > 0) {
        const minutes = Math.floor(status.seconds / 60);
        const remainderSeconds = status.seconds % 60;
        label += ` ${minutes}:${remainderSeconds.toString().padStart(2, "0")}`;
    }
    return label;
};

const PackageStatusWidget = () => {
    const [status, setStatus] = useState<PackageStatusEvent | null>(null);

    useEffect(() => {
        const unsubscribe = eventBus.on("packageStatus", (payload: PackageStatusEvent | null) => {
            setStatus(normalizeStatus(payload));
        });
        return () => unsubscribe();
    }, []);

    const display = status ? "block" : "none";
    const label = status ? formatLabel(status) : null;

    return (
        <span id="package-status" style={{ display }}>
            {label}
        </span>
    );
};

export default PackageStatusWidget;
