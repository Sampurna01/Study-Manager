import type { Course } from "./types";

// Courses (including their full text) live in IndexedDB, which has far more room
// than localStorage. Everything stays in this browser.
const DB_NAME = "study-manager";
const STORE = "courses";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const db = {
  all: () => tx<Course[]>("readonly", (s) => s.getAll() as IDBRequest<Course[]>),
  put: (course: Course) => tx("readwrite", (s) => s.put(course)),
  remove: (id: string) => tx("readwrite", (s) => s.delete(id)),
};
