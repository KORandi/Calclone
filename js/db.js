// ═══════════════════════════════════════════
// INDEXED DB STORAGE LAYER
// ═══════════════════════════════════════════
var KaltabDB = (() => {
  const DB_NAME = "kaltab_db";
  const DB_VERSION = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("logs")) {
          db.createObjectStore("logs"); // keyed by date string
        }
        if (!db.objectStoreNames.contains("cache")) {
          db.createObjectStore("cache"); // keyed by cacheType
        }
        if (!db.objectStoreNames.contains("userData")) {
          db.createObjectStore("userData"); // keyed by data name
        }
      };
      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(_db);
      };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function _tx(storeName, mode) {
    return _db.transaction(storeName, mode).objectStore(storeName);
  }

  function put(storeName, key, value) {
    return new Promise((resolve, reject) => {
      try {
        const store = _tx(storeName, "readwrite");
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  function get(storeName, key) {
    return new Promise((resolve, reject) => {
      try {
        const store = _tx(storeName, "readonly");
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      try {
        const store = _tx(storeName, "readonly");
        const result = {};
        const cursorReq = store.openCursor();
        cursorReq.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            result[cursor.key] = cursor.value;
            cursor.continue();
          } else {
            resolve(result);
          }
        };
        cursorReq.onerror = (e) => reject(e.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  function del(storeName, key) {
    return new Promise((resolve, reject) => {
      try {
        const store = _tx(storeName, "readwrite");
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  function clear(storeName) {
    return new Promise((resolve, reject) => {
      try {
        const store = _tx(storeName, "readwrite");
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
      } catch (e) {
        reject(e);
      }
    });
  }

  // Estimate size of a store in bytes
  function storeSize(storeName) {
    return getAll(storeName)
      .then((data) => {
        return new Blob([JSON.stringify(data)]).size;
      })
      .catch(() => 0);
  }

  // Save all logs at once (batch put)
  function putAllLogs(logObj) {
    return open().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction("logs", "readwrite");
        const store = tx.objectStore("logs");
        store.clear();
        for (const [dateKey, entries] of Object.entries(logObj)) {
          store.put(entries, dateKey);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
    });
  }

  return { open, put, get, getAll, del, clear, storeSize, putAllLogs };
})();
