import Client from "../../Client";
import {characterStorage} from "@modules/core/storage";
import type {CharacterStorageSchema} from "@modules/core/storageSchema";

type StorageKey = keyof CharacterStorageSchema & string;

export abstract class BaseCounter {
    protected readonly client: Client;
    private selfPersisting = false;

    constructor(client: Client) {
        this.client = client;
        client.on("reset", () => this.onReset());
    }

    protected abstract onReset(): void;

    protected setStorage<K extends StorageKey>(key: K, value: CharacterStorageSchema[K]): void {
        this.selfPersisting = true;
        characterStorage.set(key, value);
        this.selfPersisting = false;
    }

    protected onStorageChange<K extends StorageKey>(key: K, handler: (value: CharacterStorageSchema[K] | undefined) => void): void {
        characterStorage.onChange(key, (value) => {
            if (this.selfPersisting) return;
            handler(value);
        });
    }
}
