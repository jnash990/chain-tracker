/**
 * IndexedDB layer for Chain Tracker
 * Database: ChainTrackerDB
 * Object Stores: chains, config
 */

const DB_NAME = 'ChainTrackerDB';
const DB_VERSION = 1;
const STORES = { CHAINS: 'chains', CONFIG: 'config' };

let dbInstance = null;

/**
 * Initialize and open the database
 * @returns {Promise<IDBDatabase>}
 */
export function initDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.CHAINS)) {
        db.createObjectStore(STORES.CHAINS, { keyPath: 'chainId' });
      }
      if (!db.objectStoreNames.contains(STORES.CONFIG)) {
        db.createObjectStore(STORES.CONFIG, { keyPath: 'key' });
      }
    };
  });
}

/**
 * Get config value by key
 * @param {string} key
 * @returns {Promise<any>}
 */
export function getConfig(key) {
  return new Promise((resolve, reject) => {
    initDB().then((db) => {
      const tx = db.transaction(STORES.CONFIG, 'readonly');
      const store = tx.objectStore(STORES.CONFIG);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.value);
    }).catch(reject);
  });
}

/**
 * Set config value
 * @param {string} key
 * @param {any} value
 * @returns {Promise<void>}
 */
export function setConfig(key, value) {
  return new Promise((resolve, reject) => {
    initDB().then((db) => {
      const tx = db.transaction(STORES.CONFIG, 'readwrite');
      const store = tx.objectStore(STORES.CONFIG);
      const request = store.put({ key, value });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    }).catch(reject);
  });
}

/**
 * Get a single chain by chainId
 * @param {number} chainId
 * @returns {Promise<Object|null>}
 */
export function getChain(chainId) {
  return new Promise((resolve, reject) => {
    initDB().then((db) => {
      const tx = db.transaction(STORES.CHAINS, 'readonly');
      const store = tx.objectStore(STORES.CHAINS);
      const request = store.get(chainId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    }).catch(reject);
  });
}

/**
 * Save or update a chain
 * @param {Object} chain
 * @returns {Promise<void>}
 */
export function saveChain(chain) {
  return new Promise((resolve, reject) => {
    initDB().then((db) => {
      const tx = db.transaction(STORES.CHAINS, 'readwrite');
      const store = tx.objectStore(STORES.CHAINS);
      const request = store.put(chain);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    }).catch(reject);
  });
}

/**
 * Get all chains
 * @returns {Promise<Object[]>}
 */
export function getAllChains() {
  return new Promise((resolve, reject) => {
    initDB().then((db) => {
      const tx = db.transaction(STORES.CHAINS, 'readonly');
      const store = tx.objectStore(STORES.CHAINS);
      const request = store.getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? []);
    }).catch(reject);
  });
}
