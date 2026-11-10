import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorEstado } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { useSucursales } from '../../hooks/useOperaciones';
import { resultadoIncierto } from '../../lib/pos';
import { turnosService, type Apertura, type CajaFisica } from '../../services/turnos.service';

const dinero = (s: string) =>
  /^\d+(\.\d{1,2})?$/.test(s) && Number.isFinite(Number(s)) && Number(s) <= 9999999999.99;
const codigo = (c: CajaFisica) => `CAJA-${String(c.id).padStart(3, '0')}`;

/**
 * Antes de vender, el cajero elige una caja de su sucursal y la abre con su efectivo
 * inicial. La caja queda abierta (en el servidor) hasta que se cierre con el arqueo.
 */
export function PantallaCajas({
  userId,
  branchId,
  esAdmin,
  onSucursal,
}: {
  userId: number;
  branchId: number;
  esAdmin: boolean;
  onSucursal: (id: number) => void;
}) {
  const qc = useQueryClient();
  const sucursales = useSucursales();
  const cajas = useQuery({
    queryKey: ['cajas-fisicas', userId, branchId],
    queryFn: () => turnosService.cajas(branchId),
    enabled: Boolean(branchId),
  });
  const [elegida, setElegida] = useState<CajaFisica | null>(null);
  const [saldo, setSaldo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  // Se reutiliza la misma clave si no hubo respuesta: reintentar no abre dos turnos.
  const [pendiente, setPendiente] = useState<Apertura | null>(null);
  const [nombreCaja, setNombreCaja] = useState('');
  const lock = useRef(false);
  const nombreSucursal = sucursales.data?.find((s) => s.id_sucursal === branchId)?.nombre;

  async function abrir() {
    if (lock.current || !elegida) return;
    const datos =
      pendiente ??
      (dinero(saldo)
        ? { registerId: elegida.id, openingCash: Number(saldo), openingKey: crypto.randomUUID() }
        : null);
    if (!datos) {
      setError('Ingresa el efectivo inicial con hasta dos decimales.');
      return;
    }
    lock.current = true;
    setOcupado(true);
    setError('');
    setPendiente(datos);
    try {
      await turnosService.abrir(datos);
      setPendiente(null);
      setElegida(null);
      setSaldo('');
      await qc.invalidateQueries({ queryKey: ['turno-actual', userId] });
      void qc.invalidateQueries({ queryKey: ['turnos'] });
      void qc.invalidateQueries({ queryKey: ['cajas-fisicas'] });
    } catch (e) {
      if (!resultadoIncierto(e)) {
        setPendiente(null);
        void cajas.refetch();
      }
      setError(e instanceof Error ? e.message : 'No se pudo abrir la caja.');
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }

  async function crearCaja() {
    if (lock.current || !nombreCaja.trim() || !branchId) return;
    lock.current = true;
    setOcupado(true);
    setError('');
    try {
      await turnosService.crearCaja(branchId, nombreCaja.trim());
      setNombreCaja('');
      await cajas.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la caja.');
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }

  return (
    <div className="fs-pila">
      <header className="fs-panel fs-pos-cabecera">
        {nombreSucursal && <span className="fs-pos-etiqueta">{nombreSucursal}</span>}
        <h1>Cajas</h1>
        <p className="fs-sub">
          Abre una caja de esta sucursal para empezar a vender. Queda abierta hasta que la
          cierres con el arqueo.
        </p>
      </header>

      {esAdmin && (
        <div className="fs-panel fs-campo">
          <label htmlFor="sucursal-cajas">Sucursal</label>
          <select
            id="sucursal-cajas"
            className="fs-select"
            value={branchId || ''}
            onChange={(e) => onSucursal(Number(e.target.value))}
          >
            <option value="">Selecciona una sucursal</option>
            {sucursales.data?.map((s) => (
              <option key={s.id_sucursal} value={s.id_sucursal}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
      )}

      <section className="fs-panel fs-pila">
        <div className="fs-pos-pestanas" role="tablist" aria-label="Cajas">
          <span role="tab" aria-selected="true" className="fs-pos-pestana fs-pos-pestana--activa">
            Cajas registradoras
          </span>
        </div>
        {!branchId && <p>Selecciona una sucursal para ver sus cajas.</p>}
        {cajas.isPending && Boolean(branchId) && <p>Cargando cajas...</p>}
        {cajas.isError && <ErrorEstado error={cajas.error} onReintentar={() => cajas.refetch()} />}
        {error && !elegida && (
          <p role="alert" className="fs-alerta fs-alerta--error">
            {error}
          </p>
        )}
        {cajas.data && cajas.data.length === 0 && (
          <p>Esta sucursal todavia no tiene cajas. Pide al administrador que registre una.</p>
        )}
        {cajas.data && cajas.data.length > 0 && (
          <div className="fs-tabla-scroll">
            <table className="fs-tabla">
              <thead>
                <tr>
                  <th>Codigo</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Estado operativo</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cajas.data.map((c) => (
                  <tr key={c.id}>
                    <td>{codigo(c)}</td>
                    <td>{c.name}</td>
                    <td>
                      <span className="fs-pos-estado fs-pos-estado--ok">Activa</span>
                    </td>
                    <td>
                      {c.occupied ? (
                        <span className="fs-pos-estado fs-pos-estado--ocupada">
                          En uso{c.cashier ? ` · ${c.cashier}` : ''}
                        </span>
                      ) : (
                        <span className="fs-pos-estado fs-pos-estado--ok">Disponible</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="fs-btn fs-btn--acento"
                        disabled={c.occupied || ocupado}
                        onClick={() => {
                          setElegida(c);
                          setSaldo('');
                          setError('');
                          setPendiente(null);
                        }}
                      >
                        Abrir caja
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {esAdmin && Boolean(branchId) && (
          <details>
            <summary>Registrar otra caja en esta sucursal</summary>
            <div className="fs-fila-wrap" style={{ marginTop: 8 }}>
              <input
                aria-label="Nombre de la caja"
                className="fs-input"
                maxLength={80}
                placeholder="Ej. Caja 2"
                value={nombreCaja}
                onChange={(e) => setNombreCaja(e.target.value)}
              />
              <button
                type="button"
                className="fs-btn fs-btn--contorno"
                disabled={!nombreCaja.trim() || ocupado}
                onClick={crearCaja}
              >
                Crear caja
              </button>
            </div>
          </details>
        )}
      </section>

      <Modal
        abierto={Boolean(elegida)}
        titulo={elegida ? `Abrir ${elegida.name}` : 'Abrir caja'}
        onCerrar={() => {
          if (!ocupado && !pendiente) setElegida(null);
        }}
        pie={
          <>
            <button
              type="button"
              className="fs-btn fs-btn--contorno"
              disabled={ocupado || Boolean(pendiente)}
              onClick={() => setElegida(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="fs-btn fs-btn--acento"
              disabled={ocupado}
              onClick={abrir}
            >
              {ocupado ? 'Abriendo...' : pendiente ? 'Reintentar apertura' : 'Abrir caja'}
            </button>
          </>
        }
      >
        <form
          className="fs-pila"
          onSubmit={(e) => {
            e.preventDefault();
            void abrir();
          }}
        >
          {error && (
            <p role="alert" className="fs-campo-error">
              {error}
            </p>
          )}
          <div className="fs-campo">
            <label htmlFor="saldo-inicial">Efectivo inicial en caja (Bs)</label>
            <input
              id="saldo-inicial"
              className="fs-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              autoFocus
              placeholder="0.00"
              value={pendiente ? String(pendiente.openingCash) : saldo}
              disabled={Boolean(pendiente)}
              onChange={(e) => setSaldo(e.target.value)}
            />
          </div>
          <p className="fs-sub">
            Cuenta el dinero con el que empiezas. Al cerrar la caja se compara con lo vendido en
            efectivo.
          </p>
        </form>
      </Modal>
    </div>
  );
}
