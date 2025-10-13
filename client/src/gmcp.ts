import appEventBus from "./events/app-event-bus";

export const gmcp: Record<string, any> = (window as any).gmcp || ((window as any).gmcp = {});


appEventBus.on("gmcp", (event) => {
    if (typeof event.path !== 'string') return;
    setGmcp(event.path, event.value);
});

export function setGmcp(path: string, value: any) {
    const parts = path.split('.');
    let obj: any = gmcp;
    for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]] = obj[parts[i]] || {};
    }
    obj[parts[parts.length - 1]] = value;
}
