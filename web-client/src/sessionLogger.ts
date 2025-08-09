const storeName = `session_${Date.now()}`;
const dbPromise: Promise<IDBDatabase> = new Promise((resolve, reject) => {
  const version = Date.now();
  const request = indexedDB.open('ArkadiaMessagesDB', version);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(storeName, { autoIncrement: true });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

function save(text: string, type?: string) {
  dbPromise.then(db => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).add({ text, type, timestamp: Date.now() });
  }).catch(err => console.error('Failed to log message', err));
}

export default function initSessionLogger(client: any) {
  client.on('message', (text?: string, type?: string) => {
    if (text) {
      save(text, type);
    }
  });
}
