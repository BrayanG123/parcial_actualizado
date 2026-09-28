import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorEstado } from '../../components/ui/Estados';
import { Modal } from '../../components/ui/Modal';
import { moneda } from '../../lib/format';
import { resultadoIncierto } from '../../lib/pos';
import {
  turnosService,
  type Apertura,
  type Cierre,
  type Turno,
} from '../../services/turnos.service';
import { ResumenTurno } from './ResumenTurno';

const dinero = (s: string) =>
  /^\d+(\.\d{1,2})?$/.test(s) && Number.isFinite(Number(s)) && Number(s) >= 0;
type Pendiente = { tipo: 'abrir'; datos: Apertura } | { tipo: 'cerrar'; id: number; datos: Cierre };
export function PanelTurno({
  userId,
  branchId,
  turno,
  esAdmin,
  impedirCierre,
  onBloquear,
  onSucursal,
}: {
  userId: number;
  branchId: number;
  turno: Turno | null;
  esAdmin: boolean;
  impedirCierre: boolean;
  onBloquear: (busy: boolean) => void;
  onSucursal: (branchId: number) => void;
}) {
  const qc = useQueryClient();
  const cajas = useQuery({
    queryKey: ['cajas-fisicas', userId, branchId],
    queryFn: () => turnosService.cajas(branchId),
    enabled: Boolean(branchId && !turno),
  });
  const [idCaja, setCaja] = useState('');
  const [saldo, setSaldo] = useState('0');
  const [nombreCaja, setNombreCaja] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const [contado, setContado] = useState('');
  const [nota, setNota] = useState('');
  const [cerrado, setCerrado] = useState<Turno | null>(null);
  const lock = useRef(false);
  const bloqueado = ocupado || Boolean(pendiente);
  async function ejecutar(p: Pendiente) {
    if (lock.current) return;
    lock.current = true;
    setOcupado(true);
    onBloquear(true);
    setError('');
    setPendiente(p);
    let incierto = false;
    try {
      const result =
        p.tipo === 'abrir'
          ? await turnosService.abrir(p.datos)
          : await turnosService.cerrar(p.id, p.datos);
      onSucursal(result.branchId);
      setPendiente(null);
      setCerrando(false);
      if (result.closedAt) setCerrado(result);
      // Query the current shift again: an old idempotent replay can refer to a previously closed shift.
      await qc.invalidateQueries({ queryKey: ['turno-actual', userId] });
      void qc.invalidateQueries({ queryKey: ['turnos'] });
      void qc.invalidateQueries({ queryKey: ['cajas-fisicas'] });
    } catch (e) {
      incierto = resultadoIncierto(e);
      if (!incierto) {
        setPendiente(null);
        void qc.invalidateQueries({ queryKey: ['turno-actual', userId] });
        void cajas.refetch();
      }
      setError(e instanceof Error ? e.message : 'No se pudo confirmar la operacion.');
    } finally {
      lock.current = false;
      setOcupado(false);
      onBloquear(incierto);
    }
  }
  function abrir() {
    if (!idCaja || !dinero(saldo) || Number(saldo) > 9999999999.99) {
      setError('Selecciona una caja e indica un saldo inicial valido, con hasta dos decimales.');
      return;
    }
    void ejecutar({
      tipo: 'abrir',
      datos: {
        registerId: Number(idCaja),
        openingCash: Number(saldo),
        openingKey: crypto.randomUUID(),
      },
    });
  }
  function cerrar() {
    if (!turno || impedirCierre) return;
    if (!dinero(contado) || Number(contado) > 999999999999.99) {
      setError('Ingresa el efectivo contado con hasta dos decimales.');
      return;
    }
    if (
      Math.round(Number(contado) * 100) !== Math.round(turno.expectedCash * 100) &&
      !nota.trim()
    ) {
      setError('Explica el faltante o sobrante en la observacion.');
      return;
    }
    void ejecutar({
      tipo: 'cerrar',
      id: turno.id,
      datos: { countedCash: Number(contado), note: nota.trim() || undefined },
    });
  }
  async function crearCaja() {
    if (lock.current || !nombreCaja.trim() || !branchId) return;
    lock.current = true;
    setOcupado(true);
    setError('');
    try {
      const c = await turnosService.crearCaja(branchId, nombreCaja.trim());
      setCaja(String(c.id));
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
    <section className="fs-panel fs-pila">
      <div className="fs-fila-entre">
        <h2>{turno ? `Turno abierto #${turno.id}` : 'Abrir turno de caja'}</h2>
        <Link to="/caja/turnos" className="fs-btn fs-btn--contorno">
          Historial de turnos
        </Link>
      </div>
      {error && (
        <p role="alert" className="fs-campo-error">
          {error}
        </p>
      )}
      {pendiente && !ocupado && (
        <div className="fs-pila">
          <p>No se recibio confirmacion. Reintenta para consultar la misma operacion.</p>
          <button
            type="button"
            className="fs-btn fs-btn--acento"
            onClick={() => ejecutar(pendiente)}
          >
            Reintentar turno
          </button>
        </div>
      )}
      {turno ? (
        <>
          <ResumenTurno turno={turno} />
          <button
            type="button"
            className="fs-btn fs-btn--contorno"
            disabled={bloqueado || impedirCierre}
            onClick={() => {
              setCerrando(true);
              setContado('');
              setNota('');
              setError('');
            }}
          >
            Cerrar y arquear turno
          </button>
          {impedirCierre && (
            <p className="fs-sub">
              Finaliza o vacia el ticket y resuelve los cobros pendientes antes de cerrar.
            </p>
          )}
        </>
      ) : (
        <fieldset
          disabled={bloqueado || !branchId || impedirCierre}
          style={{ border: 0, padding: 0 }}
          className="fs-pila"
        >
          <p>Indica el efectivo que tienes al empezar. Cada cajero abre su propio turno.</p>
          {!branchId && <p>Selecciona una sucursal para ver sus cajas.</p>}
          {cajas.isFetching && <p>Cargando cajas...</p>}
          {cajas.isError && (
            <ErrorEstado error={cajas.error} onReintentar={() => cajas.refetch()} />
          )}
          <div className="fs-rejilla-form">
            <div className="fs-campo">
              <label htmlFor="caja-turno">Caja fisica</label>
              <select
                id="caja-turno"
                className="fs-select"
                value={idCaja}
                onChange={(e) => setCaja(e.target.value)}
              >
                <option value="">Selecciona una caja</option>
                {cajas.data?.map((c) => (
                  <option key={c.id} value={c.id} disabled={c.occupied}>
                    {c.name}
                    {c.occupied ? ` · Ocupada por ${c.cashier}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="fs-campo">
              <label htmlFor="saldo-turno">Saldo inicial en efectivo</label>
              <input
                id="saldo-turno"
                className="fs-input"
                type="number"
                min="0"
                step="0.01"
                value={saldo}
                onChange={(e) => setSaldo(e.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="fs-btn fs-btn--acento"
            onClick={abrir}
            disabled={cajas.isFetching || cajas.isError || !idCaja}
          >
            Abrir turno
          </button>
          {esAdmin && (
            <details>
              <summary>Agregar caja a esta sucursal</summary>
              <div className="fs-campo">
                <label htmlFor="nombre-caja">Nombre de caja</label>
                <input
                  id="nombre-caja"
                  className="fs-input"
                  maxLength={80}
                  value={nombreCaja}
                  onChange={(e) => setNombreCaja(e.target.value)}
                />
                <button
                  type="button"
                  className="fs-btn fs-btn--contorno"
                  onClick={crearCaja}
                  disabled={!nombreCaja.trim()}
                >
                  Crear caja
                </button>
              </div>
            </details>
          )}
        </fieldset>
      )}
      <Modal
        abierto={cerrando && Boolean(turno) && !pendiente}
        titulo="Arqueo y cierre"
        onCerrar={() => {
          if (!bloqueado) setCerrando(false);
        }}
        pie={
          <button
            type="button"
            className="fs-btn fs-btn--acento"
            disabled={bloqueado || impedirCierre}
            onClick={cerrar}
          >
            Confirmar cierre
          </button>
        }
      >
        {turno && (
          <div className="fs-pila">
            <ResumenTurno turno={turno} />
            {error && (
              <p role="alert" className="fs-campo-error">
                {error}
              </p>
            )}
            <div className="fs-campo">
              <label htmlFor="contado-turno">Efectivo contado</label>
              <input
                id="contado-turno"
                className="fs-input"
                type="number"
                min="0"
                step="0.01"
                value={contado}
                onChange={(e) => setContado(e.target.value)}
              />
            </div>
            <p>
              Diferencia:{' '}
              {moneda(dinero(contado) ? Number(contado) - turno.expectedCash : 0, turno.currency)}
            </p>
            <div className="fs-campo">
              <label htmlFor="nota-turno">Observacion (obligatoria si hay diferencia)</label>
              <textarea
                id="nota-turno"
                className="fs-input"
                maxLength={500}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            </div>
            <p>El cierre es definitivo. Para seguir vendiendo deberas abrir otro turno.</p>
          </div>
        )}
      </Modal>
      <Modal abierto={Boolean(cerrado)} titulo="Turno cerrado" onCerrar={() => setCerrado(null)}>
        {cerrado && <ResumenTurno turno={cerrado} />}
      </Modal>
    </section>
  );
}
