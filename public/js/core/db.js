import { APP_NAME, APP_VERSION, DB_NAME, DB_VERSION, STORES } from './constants.js';

let dbPromise;

function openDatabase() {
  if (!('indexedDB' in globalThis)) throw new Error('IndexedDB is not supported in this browser.');
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      createStore(db, STORES.SETTINGS, { keyPath: 'id' });
      createStore(db, STORES.RACES, { keyPath: 'id' }, [['date', 'date'], ['status', 'status']]);
      createStore(db, STORES.PLANS, { keyPath: 'id' }, [['raceId', 'raceId'], ['status', 'status']]);
      createStore(db, STORES.CHECKINS, { keyPath: 'date' }, [['createdAt', 'createdAt'], ['source', 'source']]);
      createStore(db, STORES.ACTIVITIES, { keyPath: 'id' }, [['date', 'date'], ['source', 'source'], ['externalId', 'externalId']]);
      createStore(db, STORES.PAIN, { keyPath: 'id' }, [['date', 'date'], ['area', 'area']]);
      createStore(db, STORES.WORKOUTS, { keyPath: 'planSessionId' }, [['date', 'date'], ['status', 'status']]);
      createStore(db, STORES.REHAB, { keyPath: 'id' }, [['date', 'date'], ['exerciseId', 'exerciseId']]);
      createStore(db, STORES.GEAR, { keyPath: 'id' });
      createStore(db, STORES.META, { keyPath: 'id' });
      createStore(db, STORES.BODY_COMPOSITION, { keyPath: 'id' }, [['date', 'date'], ['source', 'source']]);
      createStore(db, STORES.FOOD_LOGS, { keyPath: 'id' }, [['date', 'date'], ['foodId', 'foodId'], ['createdAt', 'createdAt']]);
      createStore(db, STORES.CUSTOM_FOODS, { keyPath: 'id' }, [['category', 'category'], ['nameTh', 'nameTh']]);
      createStore(db, STORES.WATER_LOGS, { keyPath: 'date' }, [['updatedAt', 'updatedAt']]);
      createStore(db, STORES.DAILY_FLAGS, { keyPath: 'date' }, [['foodComplete', 'foodComplete']]);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Database upgrade is blocked by another open tab.'));
  });
}

function createStore(db, name, options, indexes = []) {
  if (db.objectStoreNames.contains(name)) return;
  const store = db.createObjectStore(name, options);
  for (const [indexName, keyPath] of indexes) store.createIndex(indexName, keyPath, { unique: false });
}

export function getDb() {
  dbPromise ||= openDatabase();
  return dbPromise;
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Database transaction aborted.'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function put(storeName, value) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(structuredClone(value));
  await transactionDone(tx);
  return value;
}

export async function bulkPut(storeName, values) {
  if (!values.length) return;
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  values.forEach(value => store.put(structuredClone(value)));
  await transactionDone(tx);
}

export async function bulkRemove(storeName, keys) {
  if (!keys.length) return;
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  keys.forEach(key => store.delete(key));
  await transactionDone(tx);
}

export async function replaceAll(storeName, values) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  store.clear();
  values.forEach(value => store.put(structuredClone(value)));
  await transactionDone(tx);
}

export async function get(storeName, key) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestResult(tx.objectStore(storeName).get(key));
}

export async function getAll(storeName) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestResult(tx.objectStore(storeName).getAll());
}

export async function remove(storeName, key) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await transactionDone(tx);
}

export async function clearStore(storeName) {
  const db = await getDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).clear();
  await transactionDone(tx);
}

export async function exportSnapshot({ includeSensitive = false } = {}) {
  const snapshot = {
    app: APP_NAME,
    appVersion: APP_VERSION,
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    stores: {}
  };
  for (const storeName of Object.values(STORES)) snapshot.stores[storeName] = await getAll(storeName);
  if (!includeSensitive) sanitizeSnapshotSecrets(snapshot);
  return snapshot;
}

export async function importSnapshot(snapshot, { replace = false } = {}) {
  if (!snapshot?.stores || typeof snapshot.stores !== 'object') throw new Error('ไฟล์ Backup ไม่ถูกต้อง');
  const storeNames = Object.values(STORES).filter(storeName => Array.isArray(snapshot.stores[storeName]));
  if (!storeNames.length) throw new Error('ไฟล์ Backup ไม่มีข้อมูลที่รองรับ');
  const database = await getDb();
  const tx = database.transaction(storeNames, 'readwrite');
  for (const storeName of storeNames) {
    const store = tx.objectStore(storeName);
    if (replace) store.clear();
    for (const row of snapshot.stores[storeName]) store.put(structuredClone(row));
  }
  await transactionDone(tx);
}

function sanitizeSnapshotSecrets(snapshot) {
  const settingsRows = snapshot?.stores?.[STORES.SETTINGS];
  if (!Array.isArray(settingsRows)) return;
  for (const row of settingsRows) {
    const backup = row?.integrations?.cloudBackup;
    if (backup) {
      backup.accessToken = '';
      backup.rememberedKey = '';
      backup.autoBackupEnabled = false;
    }
    const appleShortcut = row?.integrations?.appleHealthShortcut;
    if (appleShortcut) appleShortcut.accessToken = ''; const aiCoach = row?.integrations?.aiCoach; if (aiCoach) aiCoach.accessToken = '';
  }
}
