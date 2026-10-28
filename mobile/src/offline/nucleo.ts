/**
 * Nucleo offline del movil (F6): esquema SQLite con migraciones versionadas,
 * repositorio local, cola de operaciones y sincronizador. No importa React Native:
 * recibe la base (`BaseDatos`) y el transporte, por eso se prueba con node:sqlite.
 */
import type {
  BaseDatos,
  Descarga,
  EstadoOperacion,
  ItemSeleccion,
  LineaOperacion,
  OperacionEnvio,
  OperacionLocal,
  ResultadoServidor,
  ResumenSincronizacion,
  SnapshotServidor,
  Transporte,
  VarianteLocal,
} from './tipos';

/* ------------------------------ esquema ------------------------------ */

/** Migraciones versionadas (PRAGMA user_version). Nunca editar una ya publicada. */
export const MIGRACIONES: string[] = [
  `CREATE TABLE meta (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
   CREATE TABLE sucursales (
     alcance TEXT NOT NULL, id INTEGER NOT NULL, nombre TEXT NOT NULL, ciudad TEXT NOT NULL,
     direccion TEXT, PRIMARY KEY (alcance, id));
   CREATE TABLE descargas (
     alcance TEXT NOT NULL, sucursal_id INTEGER NOT NULL, version TEXT NOT NULL,
     generado_en TEXT NOT NULL, descargado_en TEXT NOT NULL, moneda TEXT NOT NULL,
     turno_id INTEGER, caja TEXT, empresa TEXT,
     PRIMARY KEY (alcance, sucursal_id),
     FOREIGN KEY (alcance, sucursal_id) REFERENCES sucursales (alcance, id));
   CREATE TABLE productos (
     alcance TEXT NOT NULL, id INTEGER NOT NULL, nombre TEXT NOT NULL, categoria TEXT NOT NULL,
     descripcion TEXT, imagen TEXT, PRIMARY KEY (alcance, id));
   CREATE TABLE variantes (
     alcance TEXT NOT NULL, sucursal_id INTEGER NOT NULL, producto_id INTEGER NOT NULL,
     talla_id INTEGER NOT NULL, talla TEXT NOT NULL, color_id INTEGER NOT NULL, color TEXT NOT NULL,
     hex TEXT NOT NULL, precio REAL NOT NULL, descuento REAL NOT NULL, precio_neto REAL NOT NULL,
     disponible INTEGER NOT NULL CHECK (disponible >= 0),
     PRIMARY KEY (alcance, sucursal_id, producto_id, talla_id, color_id),
     FOREIGN KEY (alcance, producto_id) REFERENCES productos (alcance, id),
     FOREIGN KEY (alcance, sucursal_id) REFERENCES sucursales (alcance, id));
   CREATE TABLE clientes (
     alcance TEXT NOT NULL, id INTEGER NOT NULL, nombre TEXT NOT NULL, PRIMARY KEY (alcance, id));
   CREATE TABLE operaciones (
     operation_id TEXT PRIMARY KEY, alcance TEXT NOT NULL,
     tipo TEXT NOT NULL CHECK (tipo IN ('SALE_CASH', 'RESERVATION', 'EXCHANGE')),
     sucursal_id INTEGER NOT NULL, cliente_id INTEGER, turno_id INTEGER,
     creada_local TEXT NOT NULL, orden INTEGER NOT NULL,
     estado TEXT NOT NULL CHECK (estado IN ('LOCAL','SENDING','CONFIRMED','REJECTED','CONFLICT','RETRY','DESCARTADA')),
     intentos INTEGER NOT NULL DEFAULT 0, siguiente_intento INTEGER,
     codigo TEXT, mensaje TEXT, detalle TEXT, recurso_tipo TEXT, recurso_id INTEGER, procesada_en TEXT,
     titulo TEXT NOT NULL, total REAL, moneda TEXT, recibido REAL, horario TEXT, observacion TEXT,
     nota TEXT, actualizada TEXT NOT NULL);
   CREATE INDEX operaciones_alcance_estado ON operaciones (alcance, estado);
   CREATE TABLE operacion_lineas (
     operation_id TEXT NOT NULL REFERENCES operaciones (operation_id), n INTEGER NOT NULL,
     producto_id INTEGER NOT NULL, talla_id INTEGER NOT NULL, color_id INTEGER NOT NULL,
     nombre TEXT NOT NULL, cantidad INTEGER NOT NULL CHECK (cantidad BETWEEN 1 AND 100), precio REAL,
     PRIMARY KEY (operation_id, n));
   CREATE TABLE sync_resultados (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     operation_id TEXT NOT NULL REFERENCES operaciones (operation_id),
     intento INTEGER NOT NULL, estado TEXT NOT NULL, codigo TEXT, fecha TEXT NOT NULL);
   CREATE INDEX sync_resultados_operacion ON sync_resultados (operation_id);`,
  // v2 (F7.1): empresa y usuario responsables en cada operacion (registro completo de la venta).
  `ALTER TABLE descargas ADD COLUMN empresa_id INTEGER;
   ALTER TABLE operaciones ADD COLUMN empresa_id INTEGER;
   ALTER TABLE operaciones ADD COLUMN usuario_id INTEGER;`,
];

export async function migrar(db: BaseDatos): Promise<number> {
  await db.ejecutar('PRAGMA foreign_keys = ON');
  const actual = (await db.primero<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
  for (let version = actual; version < MIGRACIONES.length; version++) {
    await db.transaccion(async (tx) => {
      await tx.ejecutar(MIGRACIONES[version]!);
      await tx.ejecutar(`PRAGMA user_version = ${version + 1}`);
    });
  }
  return MIGRACIONES.length;
}

/* ------------------------------ utilidades ------------------------------ */

export const PENDIENTES: EstadoOperacion[] = ['LOCAL', 'SENDING', 'RETRY', 'CONFLICT'];
const CONSUMEN = "('LOCAL','SENDING','RETRY','CONFLICT','CONFIRMED')";
const LOTE = 50;
const ESPERA_BASE_MS = 5000;
const ESPERA_MAX_MS = 5 * 60 * 1000;

export const esperaReintento = (intentos: number) =>
  Math.min(ESPERA_MAX_MS, ESPERA_BASE_MS * 2 ** Math.max(0, intentos - 1));

export const alcanceDe = (api: string, empresa: string | null | undefined, usuarioId: number) =>
  `${api}|${empresa ?? 'default'}|${usuarioId}`;

/** UUID v4 (usa crypto.randomUUID si el motor JS lo ofrece). */
export function nuevoId(): string {
  const nativo = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
  if (nativo) return nativo.call((globalThis as { crypto: unknown }).crypto);
  const hex = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

let ultimoOrden = 0;
const siguienteOrden = () => (ultimoOrden = Math.max(ultimoOrden + 1, Date.now() * 1000));

export async function idDispositivo(db: BaseDatos, crear = nuevoId): Promise<string> {
  const fila = await db.primero<{ valor: string }>("SELECT valor FROM meta WHERE clave = 'dispositivo'");
  if (fila) return fila.valor;
  const valor = crear();
  await db.correr("INSERT INTO meta (clave, valor) VALUES ('dispositivo', ?)", [valor]);
  return valor;
}

/* ------------------------------ repositorio ------------------------------ */

/** Reemplaza los datos descargados de una sucursal (en una transaccion). */
export async function guardarSnapshot(db: BaseDatos, alcance: string, s: SnapshotServidor, ahora = new Date()) {
  await db.transaccion(async (tx) => {
    for (const b of [s.branch, ...s.branches])
      await tx.correr(
        `INSERT INTO sucursales (alcance, id, nombre, ciudad, direccion) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (alcance, id) DO UPDATE SET nombre = excluded.nombre, ciudad = excluded.ciudad, direccion = excluded.direccion`,
        [alcance, b.id, b.name, b.city, b.address ?? null],
      );
    await tx.correr('DELETE FROM variantes WHERE alcance = ? AND sucursal_id = ?', [alcance, s.branch.id]);
    for (const v of s.variants) {
      await tx.correr(
        `INSERT INTO productos (alcance, id, nombre, categoria, descripcion, imagen) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (alcance, id) DO UPDATE SET nombre = excluded.nombre, categoria = excluded.categoria,
           descripcion = excluded.descripcion, imagen = excluded.imagen`,
        [alcance, v.productId, v.productName, v.categoryName, v.description ?? null, v.imageUrl ?? null],
      );
      await tx.correr(
        `INSERT INTO variantes (alcance, sucursal_id, producto_id, talla_id, talla, color_id, color, hex,
           precio, descuento, precio_neto, disponible) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [alcance, s.branch.id, v.productId, v.sizeId, v.sizeName, v.colorId, v.colorName, v.hexCode,
          v.unitPrice, v.discount, v.netUnitPrice, Math.max(0, v.available)],
      );
    }
    await tx.correr('DELETE FROM clientes WHERE alcance = ?', [alcance]);
    for (const c of s.clients) await tx.correr('INSERT INTO clientes (alcance, id, nombre) VALUES (?, ?, ?)', [alcance, c.id, c.name]);
    await tx.correr(
      `INSERT INTO descargas (alcance, sucursal_id, version, generado_en, descargado_en, moneda, turno_id, caja, empresa)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (alcance, sucursal_id) DO UPDATE SET version = excluded.version, generado_en = excluded.generado_en,
         descargado_en = excluded.descargado_en, moneda = excluded.moneda, turno_id = excluded.turno_id,
         caja = excluded.caja, empresa = excluded.empresa`,
      [alcance, s.branch.id, s.version, s.generatedAt, ahora.toISOString(), s.currency,
        s.openShift?.id ?? null, s.openShift?.register.name ?? null, s.tenant?.slug ?? null],
    );
    await tx.correr('UPDATE descargas SET empresa_id = ? WHERE alcance = ? AND sucursal_id = ?', [
      s.tenant?.id ?? null, alcance, s.branch.id,
    ]);
    await tx.correr(
      `INSERT INTO meta (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor`,
      [`ultima-sucursal:${alcance}`, String(s.branch.id)],
    );
  });
}

export async function descarga(db: BaseDatos, alcance: string, sucursalId?: number): Promise<Descarga | null> {
  const id =
    sucursalId ??
    Number((await db.primero<{ valor: string }>('SELECT valor FROM meta WHERE clave = ?', [`ultima-sucursal:${alcance}`]))?.valor ?? 0);
  return db.primero<Descarga>(
    `SELECT d.sucursal_id, s.nombre AS sucursal, d.version, d.generado_en, d.descargado_en, d.moneda, d.turno_id, d.caja,
       d.empresa_id
     FROM descargas d JOIN sucursales s ON s.alcance = d.alcance AND s.id = d.sucursal_id
     WHERE d.alcance = ? AND d.sucursal_id = ?`,
    [alcance, id],
  );
}

export const sucursales = (db: BaseDatos, alcance: string) =>
  db.todos<{ id: number; nombre: string; ciudad: string }>(
    'SELECT id, nombre, ciudad FROM sucursales WHERE alcance = ? ORDER BY nombre',
    [alcance],
  );

export const clientes = (db: BaseDatos, alcance: string) =>
  db.todos<{ id: number; nombre: string }>('SELECT id, nombre FROM clientes WHERE alcance = ? ORDER BY nombre', [alcance]);

/**
 * Catalogo de la sucursal con stock local: lo descargado menos lo registrado en el
 * dispositivo despues de la descarga (lo confirmado antes ya esta en el servidor).
 */
export async function catalogo(db: BaseDatos, alcance: string, sucursalId: number, busqueda = ''): Promise<VarianteLocal[]> {
  return db.todos<VarianteLocal>(
    `SELECT v.producto_id, p.nombre AS producto, p.categoria, p.imagen, v.talla_id, v.talla, v.color_id, v.color,
       v.hex, v.precio, v.descuento, v.precio_neto,
       MAX(0, v.disponible - COALESCE((
         SELECT SUM(l.cantidad) FROM operacion_lineas l JOIN operaciones o ON o.operation_id = l.operation_id
         WHERE o.alcance = v.alcance AND o.sucursal_id = v.sucursal_id AND l.producto_id = v.producto_id
           AND l.talla_id = v.talla_id AND l.color_id = v.color_id AND o.estado IN ${CONSUMEN}
           AND (o.estado <> 'CONFIRMED' OR o.procesada_en > d.generado_en)), 0)) AS stock_local
     FROM variantes v
     JOIN productos p ON p.alcance = v.alcance AND p.id = v.producto_id
     JOIN descargas d ON d.alcance = v.alcance AND d.sucursal_id = v.sucursal_id
     WHERE v.alcance = ? AND v.sucursal_id = ? AND (p.nombre LIKE ? OR p.categoria LIKE ?)
     ORDER BY p.nombre, v.talla, v.color`,
    [alcance, sucursalId, `%${busqueda}%`, `%${busqueda}%`],
  );
}

export async function listarOperaciones(db: BaseDatos, alcance: string): Promise<OperacionLocal[]> {
  const ops = await db.todos<Omit<OperacionLocal, 'lineas'>>(
    'SELECT * FROM operaciones WHERE alcance = ? ORDER BY creada_local DESC, orden DESC',
    [alcance],
  );
  const lineas = await db.todos<LineaOperacion & { operation_id: string }>(
    `SELECT l.* FROM operacion_lineas l JOIN operaciones o ON o.operation_id = l.operation_id
     WHERE o.alcance = ? ORDER BY l.operation_id, l.n`,
    [alcance],
  );
  return ops.map((op) => ({ ...op, lineas: lineas.filter((l) => l.operation_id === op.operation_id) }));
}

/* ------------------------------ cola ------------------------------ */

interface NuevaOperacion {
  tipo: 'SALE_CASH' | 'RESERVATION';
  sucursalId: number;
  items: ItemSeleccion[];
  clienteId?: number;
  turnoId?: number | null;
  recibido?: number;
  horario?: string;
  observacion?: string;
  usuarioId?: number;
}

/**
 * Valida contra el catalogo descargado y guarda la operacion con su detalle en una
 * transaccion. Solo despues se confirma al usuario.
 */
export async function registrar(db: BaseDatos, alcance: string, datos: NuevaOperacion, crearId = nuevoId) {
  if (!datos.items.length || datos.items.length > 50) throw new Error('Selecciona entre 1 y 50 prendas distintas.');
  const claves = datos.items.map((i) => `${i.productId}:${i.sizeId}:${i.colorId}`);
  if (new Set(claves).size !== claves.length) throw new Error('Hay prendas repetidas en la seleccion.');
  return db.transaccion(async (tx) => {
    const info = await descarga(tx, alcance, datos.sucursalId);
    if (!info) throw new Error('Descarga primero los datos de la sucursal.');
    const variantes = await catalogo(tx, alcance, datos.sucursalId);
    const lineas = datos.items.map((item, n) => {
      const v = variantes.find(
        (x) => x.producto_id === item.productId && x.talla_id === item.sizeId && x.color_id === item.colorId,
      );
      if (!v) throw new Error('Una prenda no esta en los datos descargados.');
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)
        throw new Error('Cada cantidad debe estar entre 1 y 100.');
      if (item.quantity > v.stock_local)
        throw new Error(`No hay stock local suficiente de ${v.producto} (${v.talla} / ${v.color}).`);
      return { n, item, v };
    });
    const total = lineas.reduce((s, { item, v }) => s + Math.round(v.precio_neto * 100) * item.quantity, 0) / 100;
    if (datos.tipo === 'SALE_CASH') {
      const turno = datos.turnoId ?? info.turno_id;
      if (!turno) throw new Error('Abre tu turno con conexion y vuelve a descargar los datos.');
      datos.turnoId = turno;
      if (!Number.isFinite(datos.recibido) || (datos.recibido ?? 0) < total)
        throw new Error('El efectivo recibido debe cubrir el total.');
    } else {
      const horario = new Date(datos.horario ?? '');
      if (!Number.isFinite(horario.getTime()) || horario.getTime() <= Date.now())
        throw new Error('Elige una fecha y hora futura para la visita.');
      datos.horario = horario.toISOString();
    }
    const operationId = crearId();
    const ahora = new Date().toISOString();
    await tx.correr(
      `INSERT INTO operaciones (operation_id, alcance, tipo, empresa_id, usuario_id, sucursal_id, cliente_id, turno_id,
         creada_local, orden, estado, titulo, total, moneda, recibido, horario, observacion, actualizada)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'LOCAL', ?, ?, ?, ?, ?, ?, ?)`,
      [operationId, alcance, datos.tipo, info.empresa_id ?? null, datos.usuarioId ?? null, datos.sucursalId,
        datos.clienteId ?? null,
        datos.tipo === 'SALE_CASH' ? datos.turnoId : null, ahora, siguienteOrden(),
        `${datos.tipo === 'SALE_CASH' ? 'Venta en efectivo' : 'Reserva'} · ${info.sucursal}`,
        total, info.moneda, datos.recibido ?? null, datos.horario ?? null, datos.observacion?.trim() || null, ahora],
    );
    for (const { n, item, v } of lineas)
      await tx.correr(
        `INSERT INTO operacion_lineas (operation_id, n, producto_id, talla_id, color_id, nombre, cantidad, precio)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [operationId, n, item.productId, item.sizeId, item.colorId, `${v.producto} (${v.talla} / ${v.color})`,
          item.quantity, v.precio_neto],
      );
    return { operationId, total };
  });
}

/** Payload del contrato a partir de las columnas (sin JSON duplicado en la base). */
export function aEnvio(op: OperacionLocal): OperacionEnvio {
  const items = op.lineas.map((l) => ({ productId: l.producto_id, sizeId: l.talla_id, colorId: l.color_id, quantity: l.cantidad }));
  const payload: Record<string, unknown> =
    op.tipo === 'SALE_CASH'
      ? {
          shiftId: op.turno_id,
          ...(op.cliente_id ? { clientId: op.cliente_id } : {}),
          items: op.lineas.map((l, i) => ({ ...items[i], unitPrice: l.precio })),
          total: op.total,
          paymentMethod: 'CASH',
          ...(op.recibido !== null ? { cashReceived: op.recibido } : {}),
        }
      : { approximateTime: op.horario, items, ...(op.observacion ? { observation: op.observacion } : {}) };
  return {
    operationId: op.operation_id,
    type: op.tipo,
    branchId: op.sucursal_id,
    createdAtLocal: op.creada_local,
    // El servidor verifica que empresa y usuario coincidan con el token.
    ...(op.empresa_id ? { tenantId: op.empresa_id } : {}),
    ...(op.usuario_id ? { userId: op.usuario_id } : {}),
    payload,
  };
}

/* ------------------------------ sincronizador ------------------------------ */

async function actualizar(db: BaseDatos, id: string, cambios: Record<string, unknown>) {
  const campos = Object.keys(cambios);
  await db.correr(
    `UPDATE operaciones SET ${campos.map((c) => `${c} = ?`).join(', ')}, actualizada = ? WHERE operation_id = ?`,
    [...campos.map((c) => cambios[c] ?? null), new Date().toISOString(), id],
  );
}

let enCurso: Promise<ResumenSincronizacion> | null = null;

/**
 * Envia lo pendiente a POST /sync/operations y guarda el resultado de cada
 * operacion. Nunca borra operaciones. `incluir`: conflictos que el usuario reintenta.
 */
export function sincronizar(
  db: BaseDatos,
  alcance: string,
  transporte: Transporte,
  incluir: string[] = [],
): Promise<ResumenSincronizacion> {
  // Una sola sincronizacion a la vez en la app.
  const previa = enCurso ?? Promise.resolve(null);
  const actual = previa.catch(() => null).then(() => sincronizarAhora(db, alcance, transporte, incluir));
  enCurso = actual.finally(() => {
    if (enCurso === actual) enCurso = null;
  }) as Promise<ResumenSincronizacion>;
  return actual;
}

async function sincronizarAhora(db: BaseDatos, alcance: string, transporte: Transporte, incluir: string[]) {
  const resumen: ResumenSincronizacion = { enviadas: 0, confirmadas: 0, conflictos: 0, rechazadas: 0, reintentos: 0 };
  const ahora = Date.now();
  const candidatas = (await listarOperaciones(db, alcance))
    .filter(
      (op) =>
        op.estado === 'LOCAL' ||
        op.estado === 'SENDING' ||
        (op.estado === 'RETRY' && (op.siguiente_intento ?? 0) <= ahora) ||
        (incluir.includes(op.operation_id) && (op.estado === 'CONFLICT' || op.estado === 'RETRY')),
    )
    .sort((a, b) => a.creada_local.localeCompare(b.creada_local) || a.orden - b.orden);
  if (!candidatas.length) return resumen;
  const deviceId = await idDispositivo(db);
  for (let i = 0; i < candidatas.length; i += LOTE) {
    const lote = candidatas.slice(i, i + LOTE);
    for (const op of lote) await actualizar(db, op.operation_id, { estado: 'SENDING' });
    let respuesta: { results: ResultadoServidor[] };
    try {
      respuesta = await transporte.enviar(deviceId, lote.map(aEnvio));
    } catch (error) {
      const status = (error as { status?: number }).status ?? 0;
      for (const op of lote) {
        const intentos = op.intentos + 1;
        await actualizar(db, op.operation_id, {
          estado: 'RETRY',
          intentos,
          siguiente_intento: Date.now() + esperaReintento(intentos),
          codigo: status === 0 ? 'NETWORK_ERROR' : `HTTP_${status}`,
          mensaje: error instanceof Error ? error.message : 'No se pudo enviar',
        });
        await registrarIntento(db, op.operation_id, intentos, 'RETRY', status === 0 ? 'NETWORK_ERROR' : `HTTP_${status}`);
      }
      resumen.reintentos += lote.length;
      resumen.sinConexion = status === 0;
      return resumen;
    }
    resumen.enviadas += lote.length;
    for (const op of lote) {
      const r = respuesta.results.find((x) => x.operationId === op.operation_id);
      const intentos = op.intentos + 1;
      const final = r && (r.status === 'CONFIRMED' || r.status === 'REJECTED' || r.status === 'CONFLICT');
      const estado: EstadoOperacion = final ? r.status as EstadoOperacion : 'RETRY';
      await actualizar(db, op.operation_id, {
        estado,
        intentos,
        siguiente_intento: final ? null : Date.now() + esperaReintento(intentos),
        codigo: r?.code ?? null,
        mensaje: r?.message ?? null,
        detalle: r?.detail === undefined ? null : JSON.stringify(r.detail),
        recurso_tipo: r?.resourceType ?? null,
        recurso_id: r?.resourceId ?? null,
        procesada_en: r?.processedAt ?? new Date().toISOString(),
      });
      await registrarIntento(db, op.operation_id, intentos, estado, r?.code ?? null);
      if (estado === 'CONFIRMED') resumen.confirmadas++;
      else if (estado === 'CONFLICT') resumen.conflictos++;
      else if (estado === 'REJECTED') resumen.rechazadas++;
      else resumen.reintentos++;
    }
  }
  return resumen;
}

function registrarIntento(db: BaseDatos, id: string, intento: number, estado: string, codigo: string | null) {
  return db.correr('INSERT INTO sync_resultados (operation_id, intento, estado, codigo, fecha) VALUES (?, ?, ?, ?, ?)', [
    id, intento, estado, codigo, new Date().toISOString(),
  ]);
}

/** Descartar no borra: la operacion queda como DESCARTADA en el historial. */
export async function descartar(db: BaseDatos, op: OperacionLocal) {
  if (op.estado === 'CONFIRMED' || op.estado === 'SENDING') throw new Error('Una operacion confirmada o en envio no se puede descartar.');
  await actualizar(db, op.operation_id, { estado: 'DESCARTADA', nota: 'Descartada por el usuario' });
}

export const intentos = (db: BaseDatos, id: string) =>
  db.todos<{ intento: number; estado: string; codigo: string | null; fecha: string }>(
    'SELECT intento, estado, codigo, fecha FROM sync_resultados WHERE operation_id = ? ORDER BY id',
    [id],
  );
