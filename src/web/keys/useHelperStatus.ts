import { useEffect, useState } from "react";
import type { HelperConnection, HelperState } from "@modules/helper/HelperConnection";

/** The helper's connection state, and the platform it reports once connected. */
export function useHelperStatus(helperConnection: HelperConnection | null | undefined) {
    const [state, setState] = useState<HelperState>(() => helperConnection?.getState() ?? "disconnected");
    const [platform, setPlatform] = useState<string | null>(null);

    useEffect(() => {
        if (!helperConnection) return;
        const onState = (next: HelperState) => {
            setState(next);
            if (next === "connected") helperConnection.probe().then(s => setPlatform(s?.platform ?? null));
        };
        onState(helperConnection.getState());
        return helperConnection.onStateChange(onState);
    }, [helperConnection]);

    return { state, platform, connected: state === "connected" };
}
