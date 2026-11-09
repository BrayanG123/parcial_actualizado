import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '../../api/http';
import { ErrorEstado, FilasSkeleton, Vacio } from '../../components/ui/Estados';
import { Paginacion } from '../../components/ui/Paginacion';
import { useAuth } from '../../context/AuthContext';
import { useSucursales } from '../../hooks/useOperaciones';
import { fechaHora } from '../../lib/format';
import { EXPLICACION_CODIGO } from '../../offline/tipos';
import { RolNombre } from '../../types/domain';

/**
 * Bitacora de sincronizacion (RNF10): cada intento de confirmar una operacion offline con su
 * resultado, codigo y latencia. No muestra el contenido de la venta ni datos personales.
 * El encargado ve solo su sucursal; el administrador, todas.
 */
type Estado = 'PROCESSING' | 'CONFIRMED' | 'REJECTED' | 'CONFLICT';
type Tipo = 'SALE_CASH' | 'RESERVATION' | 'EXCHANGE';

export interface EntradaBitacora {
  id: number;
  attempt: number;
  status: Estado;
  errorCode: string | null;
  latencyMs: number;
  createdAt: string;
  syncOperation: {
    operationId: string;
    type: Tipo;
    branchId: number | null;
    deviceId: string;
    userId: number;
    userName: string | null;
    status: Estado;
    createdAtLocal: string;
    attempts: number;
    resultCode: string | null;
    resultMessage: string | null;
    resultDetail: unknown;
    resourceType: string | null;
    resourceId: number | null;
  };
}

interface RespuestaBitacora {
  data: EntradaBitacora[];
  summary: Array<{ status: Estado; code: string | null; count: number }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

const POR_PAGINA = 20;

export const ETIQUETA_ESTADO: Record<Estado, string> = {
  PROCESSING: 'En proceso',
  CONFIRMED: 'Confirmada',
  REJECTED: 'Rechazada',
  CONFLICT: 'En conflicto',
};
const TONO: Record<Estado, string> = {
  PROCESSING: 'info',
  CONFIRMED: 'exito',
  REJECTED: 'error',
  CONFLICT: 'alerta',
};
const RESUMEN: Record<Estado, string> = {
  CONFIRMED: 'Confirmadas',
  CONFLICT: 'En conflicto',
  REJECTED: 'Rechazadas',
  PROCESSING: 'En proceso',
};
const ETIQUETA_TIPO: Record<Tipo, string> = {
  SALE_CASH: 'Venta de contado',
  RESERVATION: 'Reserva',
  EXCHANGE: 'Cambio de prenda',
};

/** Detalle legible del conflicto: por prenda, lo pedido y lo disponible o el precio. */
export function describirDetalle(detalle: unknown): string[] {
  const variantes = (detalle as { variants?: Array<Record<string, number>> } | null)?.variants;
  if (!Array.isArray(variantes)) return [];
  return variantes.map((v) => {
    const prenda = `Prenda #${v.productId} (talla #${v.sizeId}, color #${v.colorId})`;
    if (v.requested !== undefined)
      return `${prenda}: se pidieron ${v.requested}, habia ${v.available ?? 0} disponibles${v.quota !== undefined ? ` (cupo de la caja: ${v.quota})` : ''}.`;
    if (v.localUnitPrice !== undefined)
      return `${prenda}: precio en el dispositivo ${v.localUnitPrice}, precio vigente ${v.currentUnitPrice}.`;
    return `${prenda}: ya no esta disponible.`;
  });
}

export default function PaginaBitacoraSync() {
  const { tieneRol } = useAuth();
  const esAdmin = tieneRol(RolNombre.ADMINISTRADOR);
  const sucursales = useSucursales();
  const [estado, setEstado] = useState<Estado | ''>('');
  const [tipo, setTipo] = useState<Tipo | ''>('');
  const [codigo, setCodigo] = useState('');
  const [sucursal, setSucursal] = useState('');
  const [page, setPage] = useState(1);
  const [abierta, setAbierta] = useState<number | null>(null);

  const filtros = {
    page,
    limit: POR_PAGINA,
    ...(estado ? { status: estado } : {}),
    ...(tipo ? { type: tipo } : {}),
    ...(codigo ? { errorCode: codigo } : {}),
    ...(esAdmin && sucursal ? { branchId: Number(sucursal) } : {}),
  };
  const consulta = useQuery({
    queryKey: ['sync', 'bitacora', filtros],
    queryFn: () => api.get<RespuestaBitacora>('/sync/logs', filtros),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const nombreSucursal = (id: number | null) =>
    sucursales.data?.find((s) => s.id_sucursal === id)?.nombre ?? (id ? `Sucursal #${id}` : '-');

  const resumen = (consulta.data?.summary ?? []).reduce<Record<Estado, number>>(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + r.count }),
    { PROCESSING: 0, CONFIRMED: 0, REJECTED: 0, CONFLICT: 0 },
  );
  const codigos = [...new Set((consulta.data?.summary ?? []).map((r) => r.code).filter(Boolean))] as string[];

  function cambiar<T>(set: (v: T) => void) {
    return (v: T) => {
      set(v);
      setPage(1);
    };
  }

  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Operaciones offline</p>
          <h1>Bitacora de sincronizacion</h1>
          <p className="fs-sub">
            Cada intento de confirmar una venta, reserva o cambio registrado sin conexion: resultado, codigo y
            tiempo de respuesta. {esAdmin ? 'Todas las sucursales.' : 'Solo tu sucursal.'}
          </p>
        </div>
      </header>

      <div className="fs-bitacora__resumen">
        {(['CONFIRMED', 'CONFLICT', 'REJECTED', 'PROCESSING'] as Estado[]).map((e) => (
          <button
            key={e}
            type="button"
            className={`fs-tarjeta fs-tarjeta--pad fs-bitacora__dato${estado === e ? ' fs-bitacora__dato--activo' : ''}`}
            onClick={() => cambiar(setEstado)(estado === e ? '' : e)}
            aria-pressed={estado === e}
          >
            <strong>{resumen[e]}</strong>
            <span className="fs-sub">{RESUMEN[e]}</span>
          </button>
        ))}
      </div>

      <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
        <div className="fs-fila-wrap">
          <div className="fs-campo">
            <label htmlFor="bitacora-estado">Resultado</label>
            <select
              id="bitacora-estado"
              className="fs-select"
              value={estado}
              onChange={(e) => cambiar(setEstado)(e.target.value as Estado | '')}
            >
              <option value="">Todos</option>
              {(Object.keys(ETIQUETA_ESTADO) as Estado[]).map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </select>
          </div>
          <div className="fs-campo">
            <label htmlFor="bitacora-tipo">Operacion</label>
            <select
              id="bitacora-tipo"
              className="fs-select"
              value={tipo}
              onChange={(e) => cambiar(setTipo)(e.target.value as Tipo | '')}
            >
              <option value="">Todas</option>
              {(Object.keys(ETIQUETA_TIPO) as Tipo[]).map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="fs-campo">
            <label htmlFor="bitacora-codigo">Codigo</label>
            <select
              id="bitacora-codigo"
              className="fs-select"
              value={codigo}
              onChange={(e) => cambiar(setCodigo)(e.target.value)}
            >
              <option value="">Todos</option>
              {codigos.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {esAdmin && (
            <div className="fs-campo">
              <label htmlFor="bitacora-sucursal">Sucursal</label>
              <select
                id="bitacora-sucursal"
                className="fs-select"
                value={sucursal}
                onChange={(e) => cambiar(setSucursal)(e.target.value)}
              >
                <option value="">Todas</option>
                {sucursales.data?.map((s) => (
                  <option key={s.id_sucursal} value={s.id_sucursal}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {consulta.isPending && <FilasSkeleton filas={5} />}
        {consulta.isError && <ErrorEstado error={consulta.error} onReintentar={() => consulta.refetch()} />}
        {consulta.data?.data.length === 0 && (
          <Vacio
            titulo="Sin registros"
            mensaje="Todavia no se sincronizaron operaciones offline con estos filtros."
          />
        )}
        {consulta.data && consulta.data.data.length > 0 && (
          <div className="fs-tabla-scroll">
            <table className="fs-tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Operacion</th>
                  <th>Sucursal</th>
                  <th>Personal</th>
                  <th>Intento</th>
                  <th>Resultado</th>
                  <th>Codigo</th>
                  <th className="fs-tabla-num">Latencia</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {consulta.data.data.map((l) => {
                  const op = l.syncOperation;
                  const detalle = describirDetalle(op.resultDetail);
                  return (
                    <FilaBitacora
                      key={l.id}
                      entrada={l}
                      sucursal={nombreSucursal(op.branchId)}
                      detalle={detalle}
                      abierta={abierta === l.id}
                      onAlternar={() => setAbierta(abierta === l.id ? null : l.id)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {consulta.data && consulta.data.meta.total > POR_PAGINA && (
          <Paginacion page={page} pageSize={POR_PAGINA} total={consulta.data.meta.total} onCambiar={setPage} />
        )}
      </section>
    </>
  );
}

function FilaBitacora({
  entrada: l,
  sucursal,
  detalle,
  abierta,
  onAlternar,
}: {
  entrada: EntradaBitacora;
  sucursal: string;
  detalle: string[];
  abierta: boolean;
  onAlternar: () => void;
}) {
  const op = l.syncOperation;
  return (
    <>
      <tr>
        <td>{fechaHora(l.createdAt)}</td>
        <td>
          {ETIQUETA_TIPO[op.type]}
          <span className="fs-sub fs-bitacora__id"> · {op.operationId.slice(0, 8)}</span>
        </td>
        <td>{sucursal}</td>
        <td>{op.userName ?? `Usuario #${op.userId}`}</td>
        <td>
          {l.attempt} de {op.attempts}
        </td>
        <td>
          <span className={`fs-badge fs-badge--${TONO[l.status]}`}>{ETIQUETA_ESTADO[l.status]}</span>
        </td>
        <td>{l.errorCode ?? '-'}</td>
        <td className="fs-tabla-num">{l.latencyMs} ms</td>
        <td>
          <button type="button" className="fs-btn fs-btn--fantasma fs-btn--s" onClick={onAlternar} aria-expanded={abierta}>
            {abierta ? 'Ocultar' : 'Detalle'}
          </button>
        </td>
      </tr>
      {abierta && (
        <tr className="fs-bitacora__detalle">
          <td colSpan={9}>
            <div className="fs-pila" style={{ gap: 4 }}>
              <span>
                <strong>Registrada en el dispositivo:</strong> {fechaHora(op.createdAtLocal)} ·{' '}
                <strong>Dispositivo:</strong> {op.deviceId.slice(0, 8)} · <strong>Estado actual:</strong>{' '}
                {ETIQUETA_ESTADO[op.status]}
                {op.resourceType && op.resourceId
                  ? ` · ${op.resourceType === 'SALE' ? 'Venta' : op.resourceType === 'RESERVATION' ? 'Reserva' : 'Cambio'} #${op.resourceId}`
                  : ''}
              </span>
              {l.errorCode && (
                <span>
                  <strong>{l.errorCode}:</strong> {EXPLICACION_CODIGO[l.errorCode] ?? op.resultMessage ?? ''}
                </span>
              )}
              {detalle.map((d) => (
                <span key={d} className="fs-sub">
                  {d}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
