/** Runs `runScan` (storageMeasure.ts) off the main thread. */
import { runScan } from "./storageMeasure";
import type { StorageScanRequest, StorageScanResponse } from "./storageScan.shared";

const ctx = self as unknown as {
    postMessage: (message: StorageScanResponse) => void;
    addEventListener: typeof addEventListener;
};

ctx.addEventListener("message", (event: MessageEvent<StorageScanRequest>) => {
    if (event.data?.type !== "scan") return;
    runScan(event.data, (message) => ctx.postMessage(message)).catch((error: unknown) =>
        ctx.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) }),
    );
});
