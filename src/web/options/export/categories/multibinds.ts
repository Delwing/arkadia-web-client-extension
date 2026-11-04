import { getSnapshot as getMultibindsSnapshot, replaceAll as replaceMultibinds } from "@web/dataStores/multibindStore.ts";
import type { CategoryHandler } from "../categoryHandler";

export const multibindsCategory: CategoryHandler = {
    async export() {
        const multibinds = await getMultibindsSnapshot().catch(() => []);
        return multibinds.length > 0 ? JSON.stringify(multibinds) : null;
    },
    async import(data) {
        await replaceMultibinds(Array.isArray(data) ? data : []);
    },
};
