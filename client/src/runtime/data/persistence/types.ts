export interface DataPersistenceAdapter<T> {
    read(): Promise<T | undefined>;
    write(value: T): Promise<void>;
    clear(): Promise<void>;
}
