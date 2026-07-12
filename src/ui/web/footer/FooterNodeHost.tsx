import { useEffect, useRef } from "react";

/**
 * Hosts a raw DOM node inside the React footer tree.
 *
 * Plugin footer components (and any non-React footer content) are backed by a
 * real `<span>` the plugin owns and can manipulate directly (the handle's
 * `.element`). This adopts that span into whichever UI is rendering the footer
 * by appending it to a ref'd wrapper — so the same registry item renders in the
 * forge HUD or the stock footer without the registry knowing about the DOM.
 */
export default function FooterNodeHost({ node }: { node: HTMLElement }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = ref.current;
    if (host && node.parentNode !== host) host.appendChild(node);
    return () => {
      // Detach on unmount so React can drop the host cleanly; a later remount
      // re-adopts the same node.
      if (node.parentNode) node.parentNode.removeChild(node);
    };
  }, [node]);

  return <span ref={ref} className="footer-node-host" />;
}
