import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  MIGRACIONES, aEnvio, catalogo, descartar, descarga, guardarSnapshot, intentos, listarOperaciones, migrar,
  registrar, sincronizar,
} from '../src/offline/nucleo.ts';

/** Adaptador BaseDatos sobre node:sqlite (mismo SQL que expo-sqlite). */
function abrir(ruta = ':memory:') {
  const sqlite = new DatabaseSync(ruta);
  const db = {
    ejecutar: async (sql) => sqlite.exec(sql),
    correr: async (sql, p = []) => ({ changes: Number(sqlite.prepare(sql).run(...p).changes) }),
    todos: async (sql, p = []) => sqlite.prepare(sql).all(...p),
    primero: async (sql, p = []) => sqlite.prepare(sql).get(...p) ?? null,
    transaccion: async (fn) => {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const r = await fn(db);
        sqlite.exec('COMMIT');
        return r;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    cerrar: () => sqlite.close(),
  };
  return db;
}

const A = 'http://api|fashionstore|12';
const snapshot = (extra = {}) => ({
  version: '2-1-1',
  generatedAt: new Date().toISOString(),
  tenant: { id: 1, slug: 'fashionstore', name: 'FashionStore' },
  branch: { id: 2, name: 'Centro', city: 'La Paz' },
  branches: [{ id: 2, name: 'Centro', city: 'La Paz' }, { id: 3, name: 'Norte', city: 'La Paz' }],
  currency: 'BOB',
  openShift: { id: 7, register: { id: 1, name: 'Caja 1' } },
  variants: [{
    productId: 1, productName: 'Camisa', categoryName: 'Camisas', sizeId: 1, sizeName: 'M', colorId: 1,
    colorName: 'Azul', hexCode: '#0000FF', unitPrice: 100, discount: 20, netUnitPrice: 80, available: 3,
  }],
  clients: [{ id: 31, name: 'Ana' }],
  ...extra,
});
const item = (quantity = 1) => ({ productId: 1, sizeId: 1, colorId: 1, quantity });
async function preparado(ruta) {
  const db = abrir(ruta);
  await migrar(db);
  await guardarSnapshot(db, A, snapshot());
  return db;
}

test('aplica las migraciones versionadas una sola vez', async () => {
  const db = abrir();
  assert.equal(await migrar(db), MIGRACIONES.length);
  assert.equal((await db.primero('PRAGMA user_version')).user_version, MIGRACIONES.length);
  await migrar(db);
  const tablas = (await db.todos("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map((t) => t.name);
  for (const t of ['clientes', 'descargas', 'operacion_lineas', 'operaciones', 'productos', 'sucursales', 'sync_resultados', 'variantes'])
    assert.ok(tablas.includes(t), t);
});

test('guarda el catalogo de la sucursal con integridad referencial y lo reemplaza al actualizar', async () => {
  const db = await preparado();
  assert.equal((await catalogo(db, A, 2)).length, 1);
  assert.equal((await descarga(db, A)).turno_id, 7);
  await guardarSnapshot(db, A, snapshot({ variants: [] }));
  assert.equal((await catalogo(db, A, 2)).length, 0);
  await assert.rejects(
    db.correr("INSERT INTO variantes VALUES (?, 99, 1, 1, 'M', 1, 'A', '#000', 1, 0, 1, 1)", [A]),
    /FOREIGN KEY/,
  );
});

test('registra una venta con su detalle, descuenta stock local y valida reglas', async () => {
  const db = await preparado();
  const { operationId, total } = await registrar(db, A, { tipo: 'SALE_CASH', sucursalId: 2, items: [item(2)], recibido: 200 });
  assert.equal(total, 160);
  assert.equal((await catalogo(db, A, 2))[0].stock_local, 1);
  const [op] = await listarOperaciones(db, A);
  assert.equal(op.estado, 'LOCAL');
  assert.equal(op.lineas.length, 1);
  assert.deepEqual(aEnvio(op), {
    operationId, type: 'SALE_CASH', branchId: 2, createdAtLocal: op.creada_local, tenantId: 1,
    payload: { shiftId: 7, items: [{ ...item(2), unitPrice: 80 }], total: 160, paymentMethod: 'CASH', cashReceived: 200 },
  });
  await assert.rejects(registrar(db, A, { tipo: 'SALE_CASH', sucursalId: 2, items: [item(2)], recibido: 200 }), /stock local/);
  await assert.rejects(registrar(db, A, { tipo: 'SALE_CASH', sucursalId: 2, items: [item()], recibido: 1 }), /efectivo/);
  await assert.rejects(registrar(db, A, { tipo: 'RESERVATION', sucursalId: 2, items: [item()], horario: '2020-01-01T10:00:00Z' }), /futura/);
  const reserva = await registrar(db, A, {
    tipo: 'RESERVATION', sucursalId: 2, items: [item()], horario: new Date(Date.now() + 86400000).toISOString(),
  });
  const r = (await listarOperaciones(db, A)).find((o) => o.operation_id === reserva.operationId);
  assert.deepEqual(Object.keys(aEnvio(r).payload).sort(), ['approximateTime', 'items']);
  // Una transaccion fallida no deja operaciones a medias.
  assert.equal((await listarOperaciones(db, A)).length, 2);
});

test('sobrevive al cierre de la app: los datos siguen en el archivo SQLite', async () => {
  const ruta = join(mkdtempSync(join(tmpdir(), 'fs-movil-')), 'offline.db');
  const db = await preparado(ruta);
  await registrar(db, A, { tipo: 'SALE_CASH', sucursalId: 2, items: [item()], recibido: 80 });
  db.cerrar();
  const reabierta = abrir(ruta);
  await migrar(reabierta);
  const ops = await listarOperaciones(reabierta, A);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].estado, 'LOCAL');
  assert.equal((await catalogo(reabierta, A, 2))[0].stock_local, 2);
});

test('sincroniza, guarda el resultado de cada operacion y nunca borra', async () => {
  const db = await preparado();
  await guardarSnapshot(db, A, snapshot({ variants: [{ ...snapshot().variants[0], available: 10 }] }));
  const ids = [];
  for (let i = 0; i < 3; i++)
    ids.push((await registrar(db, A, { tipo: 'SALE_CASH', sucursalId: 2, items: [item()], recibido: 80 })).operationId);
  const enviados = [];
  const respuestas = [
    { status: 'CONFIRMED', resourceType: 'SALE', resourceId: 71 },
    { status: 'CONFLICT', code: 'STOCK_INSUFFICIENT', detail: { variants: [{ requested: 1, available: 0 }] } },
    { status: 'REJECTED', code: 'INVALID_DATA' },
  ];
  const transporte = {
    enviar: async (deviceId, ops) => {
      enviados.push(...ops.map((o) => o.operationId));
      assert.match(deviceId, /^[0-9a-f-]{36}$/);
      return { results: ops.map((o, i) => ({ operationId: o.operationId, ...respuestas[i] })) };
    },
  };
  const resumen = await sincronizar(db, A, transporte);
  assert.deepEqual(resumen, { enviadas: 3, confirmadas: 1, conflictos: 1, rechazadas: 1, reintentos: 0 });
  assert.deepEqual(enviados, ids);
  const ops = await listarOperaciones(db, A);
  assert.equal(ops.length, 3);
  const por = (id) => ops.find((o) => o.operation_id === id);
  assert.equal(por(ids[0]).recurso_id, 71);
  assert.equal(por(ids[1]).codigo, 'STOCK_INSUFFICIENT');
  assert.equal(JSON.parse(por(ids[1]).detalle).variants[0].available, 0);
  assert.equal(por(ids[2]).estado, 'REJECTED');
  // Nada se reenvia solo; el conflicto se reintenta a pedido con el mismo id.
  enviados.length = 0;
  respuestas.splice(0, 3, { status: 'CONFIRMED', resourceType: 'SALE', resourceId: 72 });
  assert.equal((await sincronizar(db, A, transporte)).enviadas, 0);
  await sincronizar(db, A, transporte, [ids[1]]);
  assert.deepEqual(enviados, [ids[1]]);
  assert.equal((await listarOperaciones(db, A)).find((o) => o.operation_id === ids[1]).estado, 'CONFIRMED');
  assert.deepEqual((await intentos(db, ids[1])).map((i) => i.estado), ['CONFLICT', 'CONFIRMED']);
});

test('sin red pasa a RETRY con espera creciente; un envio interrumpido se reenvia igual', async () => {
  const db = await preparado();
  const { operationId } = await registrar(db, A, { tipo: 'SALE_CASH', sucursalId: 2, items: [item()], recibido: 80 });
  const caido = { enviar: async () => { throw Object.assign(new Error('Network Error'), { status: 0 }); } };
  const r = await sincronizar(db, A, caido);
  assert.equal(r.sinConexion, true);
  let [op] = await listarOperaciones(db, A);
  assert.equal(op.estado, 'RETRY');
  assert.equal(op.codigo, 'NETWORK_ERROR');
  assert.ok(op.siguiente_intento > Date.now());
  const enviados = [];
  const ok = { enviar: async (_d, ops) => { enviados.push(...ops.map((o) => o.operationId)); return { results: ops.map((o) => ({ operationId: o.operationId, status: 'CONFIRMED' })) }; } };
  assert.equal((await sincronizar(db, A, ok)).enviadas, 0); // aun en espera
  await db.correr("UPDATE operaciones SET estado = 'SENDING'");
  await sincronizar(db, A, ok);
  assert.deepEqual(enviados, [operationId]);
  [op] = await listarOperaciones(db, A);
  assert.equal(op.estado, 'CONFIRMED');
  assert.equal(op.intentos, 2);
});

test('descartar conserva la operacion y no aplica a confirmadas', async () => {
  const db = await preparado();
  await registrar(db, A, { tipo: 'SALE_CASH', sucursalId: 2, items: [item()], recibido: 80 });
  const [op] = await listarOperaciones(db, A);
  await descartar(db, op);
  assert.equal((await listarOperaciones(db, A))[0].estado, 'DESCARTADA');
  await assert.rejects(descartar(db, { ...op, estado: 'CONFIRMED' }));
  assert.equal((await catalogo(db, A, 2))[0].stock_local, 3);
});

test('migracion v2: una base v1 con datos conserva sus operaciones y agrega empresa/usuario', async () => {
  const db = abrir();
  await db.ejecutar(MIGRACIONES[0]);
  await db.ejecutar('PRAGMA user_version = 1');
  await db.correr(
    `INSERT INTO operaciones (operation_id, alcance, tipo, sucursal_id, creada_local, orden, estado, titulo, actualizada)
     VALUES ('op-v1', ?, 'SALE_CASH', 2, '2026-10-01T10:00:00Z', 1, 'LOCAL', 'Venta antigua', '2026-10-01T10:00:00Z')`,
    [A],
  );
  await migrar(db);
  assert.equal((await db.primero('PRAGMA user_version')).user_version, MIGRACIONES.length);
  const [op] = await listarOperaciones(db, A);
  assert.equal(op.operation_id, 'op-v1');
  assert.equal(op.empresa_id, null);
  await guardarSnapshot(db, A, snapshot());
  const nueva = await registrar(db, A, { tipo: 'SALE_CASH', sucursalId: 2, items: [item()], recibido: 80, usuarioId: 12 });
  const envio = aEnvio((await listarOperaciones(db, A)).find((o) => o.operation_id === nueva.operationId));
  assert.equal(envio.tenantId, 1);
  assert.equal(envio.userId, 12);
});
