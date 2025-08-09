const sessionId = Date.now();
const storeName = `session_${sessionId}`;
const dbPromise: Promise<IDBDatabase> = new Promise((resolve, reject) => {
  const request = indexedDB.open('ArkadiaMessagesDB', sessionId);
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
