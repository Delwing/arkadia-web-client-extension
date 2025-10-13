export interface DataSource<T> {
  load(): Promise<T>;
}

export type DataStoreListener<T> = (data: T) => void;

export interface PersistenceRecord<T> {
  data: T;
  timestamp: number;
}

export interface PersistenceAdapter {
  load<T>(storeName: string, key: string): Promise<PersistenceRecord<T> | null>;
  save<T>(storeName: string, key: string, record: PersistenceRecord<T>): Promise<void>;
  delete(storeName: string, key: string): Promise<void>;
}
