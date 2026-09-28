import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSucursales } from '../../hooks/useOperaciones';
import { Cargando, ErrorEstado } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { Paginacion } from '../../components/ui/Paginacion';
import { fechaHora, moneda } from '../../lib/format';
import { turnosService, type Turno } from '../../services/turnos.service';
import { ResumenTurno } from './ResumenTurno';
import { USAR_MOCKS } from '../../api/config';

export default function PaginaTurnos() {
  return USAR_MOCKS ? (
    <p>Los turnos de caja estan disponibles al conectar la API real.</p>
  ) : (
    <Historial />
  );
}
function Historial() {
  const auth = useAuth();
  const [page, setPage] = useState(1);
  const [branchId, setBranch] = useState<number>();
  const [detalle, setDetalle] = useState<Turno | null>(null);
  const sucursales = useSucursales();
  const q = useQuery({
    queryKey: ['turnos', auth.usuario?.id_usuario, page, branchId],
    queryFn: () => turnosService.historial(page, branchId),
  });
  return (
    <>
      <header className="fs-pagina-cabecera">
        <div>
          <h1>Turnos y arqueos</h1>
          <p className="fs-sub">
            Cajeros: turnos propios. Encargados: su sucursal. Administracion: todas las sucursales.
          </p>
        </div>
        <Link to="/caja" className="fs-btn fs-btn--contorno">
          Punto de venta
        </Link>
      </header>
      {auth.tieneRol('ADMINISTRADOR') && (
        <div className="fs-campo">
          <label htmlFor="sucursal-turnos">Sucursal</label>
          <select
            id="sucursal-turnos"
            className="fs-select"
            value={branchId ?? ''}
            onChange={(e) => {
              setBranch(Number(e.target.value) || undefined);
              setPage(1);
            }}
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
      {q.isPending && <Cargando texto="Cargando turnos..." />}
      {q.isError && <ErrorEstado error={q.error} onReintentar={() => q.refetch()} />}
      {q.data && (
        <section className="fs-panel fs-pila">
          {q.data.data.length === 0 ? (
            <p>No hay turnos registrados.</p>
          ) : (
            <div className="fs-tabla-scroll">
              <table className="fs-tabla">
                <thead>
                  <tr>
                    <th>Turno / caja</th>
                    <th>Cajero</th>
                    <th>Apertura</th>
                    <th>Estado</th>
                    <th>Ventas</th>
                    <th>Diferencia</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {q.data.data.map((t) => (
                    <tr key={t.id}>
                      <td>
                        #{t.id} · {t.branchName} / {t.registerName}
                      </td>
                      <td>{t.cashier}</td>
                      <td>{fechaHora(t.openedAt)}</td>
                      <td>{t.closedAt ? 'Cerrado' : 'Abierto'}</td>
                      <td>{moneda(t.totalSales, t.currency)}</td>
                      <td>
                        {t.difference === null ? 'Pendiente' : moneda(t.difference, t.currency)}
                      </td>
                      <td>
                        <button
                          className="fs-btn fs-btn--contorno"
                          type="button"
                          onClick={() => setDetalle(t)}
                        >
                          Ver arqueo
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion page={page} pageSize={15} total={q.data.meta.total} onCambiar={setPage} />
        </section>
      )}
      <Modal
        abierto={Boolean(detalle)}
        titulo={`Turno #${detalle?.id ?? ''}`}
        onCerrar={() => setDetalle(null)}
      >
        {detalle && <ResumenTurno turno={detalle} />}
      </Modal>
    </>
  );
}
