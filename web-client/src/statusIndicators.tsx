import { createRoot, type Root } from "react-dom/client";
import { StatusIndicators } from "@web-ui/components/StatusIndicators.tsx";

type MountResult = {
    destroy: () => void;
};

const mountStatusIndicators = (): MountResult => {
    const statusIndicators = document.getElementById("status-indicators");
    if (!statusIndicators) {
        return { destroy: () => {} };
    }

    const root: Root = createRoot(statusIndicators);
    root.render(<StatusIndicators />);

    return {
        destroy: () => root.unmount(),
    };
};

export default mountStatusIndicators;
