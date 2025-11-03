import {useEffect, useState} from "react";
import eventBus from "../../../../client/src/eventBus";
import {PackageStatus} from "../../../shared/events";

const normalizeStatus = (payload: unknown): PackageStatus | null => {
    if (!payload || typeof payload !== "object") {
        return null;
    }
    const {recipient, seconds} = payload as PackageStatus;
    if (typeof recipient !== "string" || recipient.length === 0) {
        return null;
    }
    return {
        recipient,
        seconds: typeof seconds === "number" ? seconds : null,
    };
};

const PackageStatusWidget = () => {
        const [status, setStatus] = useState<PackageStatus | null>(null);

        useEffect(() => {
            const unsubscribe = eventBus.on("packageStatus", (payload) => {
                setStatus(normalizeStatus(payload));
            });
            return () => unsubscribe();
        }, []);

        const display = status ? "block" : "none";

        let label = ""

        if (status) {
            label = `📦: ${status.recipient}`;
            if (typeof status.seconds === "number" && status.seconds > 0) {
                const minutes = Math.floor(status.seconds / 60);
                const remainderSeconds = status.seconds % 60;
                label += ` ${minutes}:${remainderSeconds.toString().padStart(2, "0")}`;
            }
        }

        return (
            <span id="package-status" style={{display}}>{status ? label : null}</span>
        );
    }
;

export default PackageStatusWidget;
