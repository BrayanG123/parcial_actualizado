/**
 * Persistencia local en IndexedDB (sobrevive a recargas y al cierre del navegador).
 * Sin dependencias: un envoltorio minimo de promesas sobre la API nativa.
 */
const NOMBRE = 'fashionstore-offline';
const VERSION = 1;
export const ALMACENES = { snapshots: 'snapshots', operaciones: 'operaciones', meta: 'meta' } as const;
type Almacen = (typeof ALMACENES)[keyof typeof ALMACENES];

let conexion: Promise<IDBDatabase> | null = null;

export function abrirDb(): Promise<IDBDatabase> {
  if (conexion) return conexion;
  if (typeof indexedDB === 'undefined')
    return Promise.reject(new Error('Este navegador no permite guardar datos offline (IndexedDB).'));
  conexion = new Promise((resolve, reject) => {
    const peticion = indexedDB.open(NOMBRE, VERSION);
    // Migraciones versionadas del esquema local.
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      if (!db.objectStoreNames.contains(ALMACENES.snapshots)) {
        const s = db.createObjectStore(ALMACENES.snapshots, { keyPath: 'clave' });
        s.createIndex('alcance', 'alcance');
      }
      if (!db.objectStoreNames.contains(ALMACENES.operaciones)) {
        const s = db.createObjectStore(ALMACENES.operaciones, { keyPath: 'operationId' });
        s.createIndex('alcance', 'alcance');
      }
      if (!db.objectStoreNames.contains(ALMACENES.meta)) db.createObjectStore(ALMACENES.meta, { keyPath: 'clave' });
    };
    peticion.onsuccess = () => {
      const db = peticion.result;
      db.onversionchange = () => {
        db.close();
        conexion = null;
      };
      resolve(db);
    };
    peticion.onerror = () => {
      conexion = null;
      reject(peticion.error ?? new Error('No se pudo abrir el almacenamiento offline.'));
    };
  });
  return conexion;
}

/** Solo pruebas: cierra la conexion para empezar con una base limpia. */
export async function cerrarDb() {
  const db = await conexion?.catch(() => null);
  db?.close();
  conexion = null;
}

function completar<T>(peticion: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

export async function leer<T>(almacen: Almacen, clave: string): Promise<T | undefined> {
  const db = await abrirDb();
  return completar(db.transaction(almacen).objectStore(almacen).get(clave)) as Promise<T | undefined>;
}

export async function porAlcance<T>(almacen: Almacen, alcance: string): Promise<T[]> {
  const db = await abrirDb();
  return completar(db.transaction(almacen).objectStore(almacen).index('alcance').getAll(alcance)) as Promise<T[]>;
}

/** Escribe y espera el commit de la transaccion: recien entonces el dato es durable. */
export async function escribir<T>(almacen: Almacen, ...valores: T[]): Promise<void> {
  const db = await abrirDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(almacen, 'readwrite');
    const store = tx.objectStore(almacen);
    for (const valor of valores) store.put(valor);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Escritura offline cancelada'));
  });
}
