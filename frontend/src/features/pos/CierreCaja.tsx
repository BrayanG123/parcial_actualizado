import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { moneda } from '../../lib/format';
import { resultadoIncierto } from '../../lib/pos';
import { turnosService, type Turno } from '../../services/turnos.service';
import { ResumenTurno } from './ResumenTurno';

const dinero = (s: string) =>
  /^\d+(\.\d{1,2})?$/.test(s) && Number.isFinite(Number(s)) && Number(s) <= 999999999999.99;

/** Arqueo y cierre de la caja abierta. Despues del cierre se vuelve a la lista de cajas. */
export function CierreCaja({
  userId,
  turno,
  bloqueado,
  onCerrada,
}: {
  userId: number;
  turno: Turno;
  bloqueado: boolean;
  onCerrada: (t: Turno) => void;
}) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [contado, setContado] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [pendiente, setPendiente] = useState<{ countedCash: number; note?: string } | null>(null);
  const lock = useRef(false);

  async function cerrar() {
    if (lock.current || bloqueado) return;
    let datos = pendiente;
    if (!datos) {
      if (!dinero(contado)) {
        setError('Ingresa el efectivo contado con hasta dos decimales.');
        return;
      }
      if (Math.round(Number(contado) * 100) !== Math.round(turno.expectedCash * 100) && !nota.trim()) {
        setError('Hay diferencia con el efectivo esperado: explica el faltante o sobrante.');
        return;
      }
      datos = { countedCash: Number(contado), note: nota.trim() || undefined };
    }
    lock.current = true;
    setOcupado(true);
    setError('');
    setPendiente(datos);
    try {
      const cerrado = await turnosService.cerrar(turno.id, datos);
      setPendiente(null);
      setAbierto(false);
      onCerrada(cerrado);
      await qc.invalidateQueries({ queryKey: ['turno-actual', userId] });
      void qc.invalidateQueries({ queryKey: ['turnos'] });
      void qc.invalidateQueries({ queryKey: ['cajas-fisicas'] });
    } catch (e) {
      if (!resultadoIncierto(e)) setPendiente(null);
      setError(e instanceof Error ? e.message : 'No se pudo cerrar la caja.');
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="fs-btn fs-btn--contorno"
        disabled={bloqueado}
        title={bloqueado ? 'Finaliza o vacia el ticket antes de cerrar la caja' : undefined}
        onClick={() => {
          setAbierto(true);
          setContado('');
          setNota('');
          setError('');
        }}
      >
        Cerrar caja
      </button>
      <Modal
        abierto={abierto}
        titulo="Arqueo y cierre de caja"
        onCerrar={() => {
          if (!ocupado && !pendiente) setAbierto(false);
        }}
        pie={
          <>
            <button
              type="button"
              className="fs-btn fs-btn--contorno"
              disabled={ocupado || Boolean(pendiente)}
              onClick={() => setAbierto(false)}
            >
              Seguir vendiendo
            </button>
            <button
              type="button"
              className="fs-btn fs-btn--acento"
              disabled={ocupado || bloqueado}
              onClick={cerrar}
            >
              {ocupado ? 'Cerrando...' : pendiente ? 'Reintentar cierre' : 'Confirmar cierre'}
            </button>
          </>
        }
      >
        <div className="fs-pila">
          <ResumenTurno turno={turno} />
          {error && (
            <p role="alert" className="fs-campo-error">
              {error}
            </p>
          )}
          <div className="fs-campo">
            <label htmlFor="contado-caja">Efectivo contado en caja</label>
            <input
              id="contado-caja"
              className="fs-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={pendiente ? String(pendiente.countedCash) : contado}
              disabled={Boolean(pendiente)}
              onChange={(e) => setContado(e.target.value)}
            />
          </div>
          <p>
            Diferencia:{' '}
            <strong>
              {moneda(dinero(contado) ? Number(contado) - turno.expectedCash : 0, turno.currency)}
            </strong>
          </p>
          <div className="fs-campo">
            <label htmlFor="nota-caja">Observacion (obligatoria si hay diferencia)</label>
            <textarea
              id="nota-caja"
              className="fs-input"
              maxLength={500}
              value={pendiente ? (pendiente.note ?? '') : nota}
              disabled={Boolean(pendiente)}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
          <p className="fs-sub">El cierre es definitivo: para volver a vender abre la caja otra vez.</p>
        </div>
      </Modal>
    </>
  );
}
