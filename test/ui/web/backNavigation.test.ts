import { backLayerCount, pushBackLayer, setBackNavigationEnabled } from "@web-ui/backNavigation.ts";

/** history.go() and Back land as a popstate on a later task. */
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

const ourDepth = () => (history.state as Record<string, unknown> | null)?.__arkadiaBackLayer ?? 0;

async function back() {
    history.back();
    await settle();
}

describe("back navigation", () => {
    const releases: Array<() => void> = [];
    const push = (close: () => void) => {
        const release = pushBackLayer(close);
        releases.push(release);
        return release;
    };

    beforeEach(() => setBackNavigationEnabled(true));

    afterEach(async () => {
        releases.splice(0).forEach(release => release());
        await settle();
        setBackNavigationEnabled(null);
    });

    it("gives each open layer a history entry", () => {
        push(() => {});
        push(() => {});
        expect(backLayerCount()).toBe(2);
        expect(ourDepth()).toBe(2);
    });

    it("closes the top layer on Back, then the next", async () => {
        const closed: string[] = [];
        push(() => closed.push("modal"));
        push(() => closed.push("menu"));

        await back();
        expect(closed).toEqual(["menu"]);
        expect(backLayerCount()).toBe(1);

        await back();
        expect(closed).toEqual(["menu", "modal"]);
        expect(backLayerCount()).toBe(0);
        expect(ourDepth()).toBe(0);
    });

    it("takes the entry back when a layer closes by other means", async () => {
        const closed: string[] = [];
        push(() => closed.push("modal"));
        const releaseDialog = push(() => closed.push("dialog"));

        releaseDialog();
        await settle();
        expect(ourDepth()).toBe(1);

        await back();
        expect(closed).toEqual(["modal"]);
    });

    it("keeps the count right when a layer under the top one closes", async () => {
        const closed: string[] = [];
        const releaseModal = push(() => closed.push("modal"));
        push(() => closed.push("dialog"));

        releaseModal();
        await settle();
        expect(ourDepth()).toBe(1);

        await back();
        expect(closed).toEqual(["dialog"]);
        expect(ourDepth()).toBe(0);
    });

    it("copes with a layer opening while another's entry is being taken back", async () => {
        const closed: string[] = [];
        const releaseMenu = push(() => closed.push("menu"));
        releaseMenu();
        push(() => closed.push("window"));
        await settle();
        expect(ourDepth()).toBe(1);

        await back();
        expect(closed).toEqual(["window"]);
    });

    it("ignores a second release and a release after Back", async () => {
        const release = push(() => {});
        await back();
        release();
        release();
        await settle();
        expect(backLayerCount()).toBe(0);
        expect(ourDepth()).toBe(0);
    });

    it("does nothing where Back is not handled", () => {
        setBackNavigationEnabled(false);
        const depthBefore = ourDepth();
        push(() => {});
        expect(backLayerCount()).toBe(0);
        expect(ourDepth()).toBe(depthBefore);
    });
});
