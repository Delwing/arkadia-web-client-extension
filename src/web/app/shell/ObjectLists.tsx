import { useLayoutEffect } from "react";
import { DEFAULT_SLOT } from "@web/layout/movableHost.ts";
import { objectListHost, objectListOthersHost } from "./mapHosts";

/**
 * The object lists' default place: straight inside #main-container, where the
 * vertical-rails grid places its direct children, whenever no layout panel shows
 * them. Renders nothing itself until the shell renders #main-container.
 */
export function ObjectLists() {
    useLayoutEffect(() => {
        const main = document.getElementById("main-container");
        if (!main) return;
        const before = document.getElementById("recording-button-root");
        const detachList = objectListHost.attach(main, DEFAULT_SLOT, before);
        const detachOthers = objectListOthersHost.attach(main, DEFAULT_SLOT, before);
        return () => { detachList(); detachOthers(); };
    }, []);
    return null;
}
