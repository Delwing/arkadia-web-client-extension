class HtmlLogger {
    private db: IDBDatabase | null = null;
    private storeName = 'lines';

    startSession() {
        const name = `html_logs_${Date.now()}`;
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(this.storeName, { autoIncrement: true });
        };
        request.onsuccess = () => {
            this.db = request.result;
        };
    }

    endSession() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    logLine(text: string, type?: string, timestamp: number = Date.now()) {
        if (!this.db) return;
        const tx = this.db.transaction(this.storeName, 'readwrite');
        tx.objectStore(this.storeName).add({ timestamp, text, type });
    }
}

export default new HtmlLogger();
