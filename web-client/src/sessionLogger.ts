const sessionId = Date.now();
const storeName = `session_${sessionId}`;

const dbPromise: Promise<IDBDatabase> = new Promise((resolve, reject) => {
  // First open the database to determine the current version
  const initialRequest = indexedDB.open('ArkadiaMessagesDB');

  initialRequest.onsuccess = () => {
    const db = initialRequest.result;

    // If the store for this session already exists resolve immediately
    if (db.objectStoreNames.contains(storeName)) {
      resolve(db);
      return;
    }

    // Otherwise upgrade the database to create a store for this session
    const newVersion = db.version + 1;
    db.close();
    const upgradeRequest = indexedDB.open('ArkadiaMessagesDB', newVersion);
    upgradeRequest.onupgradeneeded = () => {
      upgradeRequest.result.createObjectStore(storeName, { autoIncrement: true });
    };
    upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
    upgradeRequest.onerror = () => reject(upgradeRequest.error);
  };

  // When the database does not yet exist this event will fire
  initialRequest.onupgradeneeded = () => {
    initialRequest.result.createObjectStore(storeName, { autoIncrement: true });
  };

  initialRequest.onerror = () => reject(initialRequest.error);
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
