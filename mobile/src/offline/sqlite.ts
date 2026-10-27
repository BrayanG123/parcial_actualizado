/** Adaptador de expo-sqlite (SDK 57) a la interfaz BaseDatos del nucleo offline. */
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import { migrar } from './nucleo';
import type { BaseDatos } from './tipos';

const ARCHIVO = 'fashionstore-offline.db';

function envolver(db: SQLite.SQLiteDatabase): BaseDatos {
  const adaptador: BaseDatos = {
    ejecutar: (sql) => db.execAsync(sql),
    correr: async (sql, params = []) => ({
      changes: (await db.runAsync(sql, params as SQLite.SQLiteBindParams)).changes,
    }),
    todos: (sql, params = []) => db.getAllAsync(sql, params as SQLite.SQLiteBindParams),
    primero: (sql, params = []) => db.getFirstAsync(sql, params as SQLite.SQLiteBindParams),
    transaccion: async <T,>(fn: (tx: BaseDatos) => Promise<T>) => {
      let resultado: T | undefined;
      // Exclusiva: otras consultas esperan hasta el commit (todo o nada).
      await db.withExclusiveTransactionAsync(async (txn) => {
        resultado = await fn(envolver(txn));
      });
      return resultado as T;
    },
  };
  return adaptador;
}

export const offlineDisponible = Platform.OS !== 'web';

let base: Promise<BaseDatos> | null = null;

/** Abre (una vez) la base local y aplica las migraciones pendientes. */
export function abrirBase(): Promise<BaseDatos> {
  if (!offlineDisponible)
    return Promise.reject(new Error('La operacion offline esta disponible en la app Android/iOS.'));
  base ??= SQLite.openDatabaseAsync(ARCHIVO).then(async (db) => {
    const adaptada = envolver(db);
    await migrar(adaptada);
    return adaptada;
  });
  base.catch(() => {
    base = null;
  });
  return base;
}
