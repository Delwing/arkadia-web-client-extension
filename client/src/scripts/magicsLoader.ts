import {dataCatalog} from "../dataCatalog/catalogInstance";

export default async function loadMagics(): Promise<string[]> {
    try {
        const data = await dataCatalog.getMagicsStore().getData();
        const magics: string[] = [];
        for (const value of Object.values(data.magics)) {
            if (value && Array.isArray(value.regexps)) {
                magics.push(...value.regexps);
            }
        }
        return magics;
    } catch (e) {
        console.error("Failed to load magics:", e);
        return [];
    }
}
