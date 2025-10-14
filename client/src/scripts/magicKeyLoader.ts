import {dataCatalog} from "../dataCatalog/catalogInstance";

export default async function loadMagicKeys(): Promise<string[]> {
    try {
        const data = await dataCatalog.getMagicKeysStore().getData();
        if (!Array.isArray(data.magic_keys)) {
            throw new Error("Invalid data format");
        }
        return data.magic_keys;
    } catch (e) {
        console.error("Failed to load magic keys:", e);
        return [];
    }
}
