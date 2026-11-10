/* Tiny IndexedDB wrapper: stores "tests" and "scans" locally on the device. Nothing leaves the device. */
const DB = "mcq-quickcheck-web", V = 1;
function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, V);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("tests")) d.createObjectStore("tests", { keyPath: "id" }); if (!d.objectStoreNames.contains("scans")) { const s = d.createObjectStore("scans", { keyPath: "id" }); s.createIndex("testId", "testId"); } };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const run = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const tx = db.transaction(store, mode), req = fn(tx.objectStore(store)); tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error); }); };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const putTest = (t) => run("tests", "readwrite", (s) => s.put(t));
export const allTests = async () => (await run("tests", "readonly", (s) => s.getAll())).sort((a, b) => b.updatedAt - a.updatedAt);
export const getTest = (id) => run("tests", "readonly", (s) => s.get(id));
export const delTest = (id) => run("tests", "readwrite", (s) => s.delete(id));
export const putScan = (x) => run("scans", "readwrite", (s) => s.put(x));
export const allScans = async () => (await run("scans", "readonly", (s) => s.getAll())).sort((a, b) => b.ts - a.ts);
export const delScan = (id) => run("scans", "readwrite", (s) => s.delete(id));
export const persist = async () => { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; } };
