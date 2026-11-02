/** Opens the /pilot window in a React root of its own, so the app's tree is untouched. */

import { createRoot, type Root } from "react-dom/client";
import { RemoteControlModal } from "./RemoteControlModal";

let root: Root | null = null;
let host: HTMLElement | null = null;

export function openRemoteControlModal(): void {
    if (root) return;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const close = () => {
        root?.unmount();
        host?.remove();
        root = null;
        host = null;
    };
    root.render(<RemoteControlModal onClose={close}/>);
}
