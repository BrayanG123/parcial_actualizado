import { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useRegistrarMovimiento } from '../../hooks/useOperaciones';
import { stockDisponible } from '../../lib/domain';
import { TipoMovimiento, type Inventario } from '../../types/domain';

/** Tipos que un encargado puede registrar manualmente. */
const TIPOS: Array<{ valor: TipoMovimiento; texto: string; ayuda: string }> = [
  {
    valor: TipoMovimiento.ENTRADA,
    texto: 'Entrada',
    ayuda: 'Recepcion de mercaderia del proveedor.',
  },
  {
    valor: TipoMovimiento.DEVOLUCION,
    texto: 'Devolucion',
    ayuda: 'La prenda regresa al stock fisico.',
  },
  {
    valor: TipoMovimiento.AJUSTE,
    texto: 'Ajuste de inventario',
    ayuda: 'Fija el stock fisico al valor indicado.',
  },
  {
    valor: TipoMovimiento.INGRESO_PENDIENTE,
    texto: 'Ingreso programado',
    ayuda: 'Registra una entrada futura sin modificar el stock actual.',
  },
];

interface Props {
  inventario: Inventario | null;
  onCerrar: () => void;
}

export function ModalMovimiento({ inventario, onCerrar }: Props) {
  const registrar = useRegistrarMovimiento();
  const toast = useToast();

  const [tipo, setTipo] = useState<TipoMovimiento>(TipoMovimiento.ENTRADA);
  const [cantidad, setCantidad] = useState(1);
  const [referencia, setReferencia] = useState('');
  const [observacion, setObservacion] = useState('');
  const [fechaProgramada, setFechaProgramada] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!inventario) return;
    setTipo(TipoMovimiento.ENTRADA);
    setCantidad(1);
    setReferencia('');
    setObservacion('');
    setFechaProgramada('');
    setError('');
  }, [inventario]);

  const ayuda = TIPOS.find((t) => t.valor === tipo)?.ayuda;

  async function enviar() {
    if (!inventario) return;
    if (!Number.isInteger(cantidad) || cantidad < (tipo === TipoMovimiento.AJUSTE ? 0 : 1))
      return setError('Ingresa una cantidad entera valida.');
    if (tipo === TipoMovimiento.AJUSTE && cantidad < inventario.cantidad_reservada)
      return setError('El stock fisico no puede ser menor que las unidades reservadas.');
    if (tipo === TipoMovimiento.AJUSTE && cantidad === inventario.cantidad_fisica)
      return setError('El stock final debe ser diferente al actual.');
    if (
      (tipo === TipoMovimiento.AJUSTE || tipo === TipoMovimiento.DEVOLUCION) &&
      !observacion.trim()
    )
      return setError('Explica el motivo del ajuste o la devolucion.');
    if (
      tipo === TipoMovimiento.INGRESO_PENDIENTE &&
      (!fechaProgramada ||
        !Number.isFinite(Date.parse(fechaProgramada)) ||
        Date.parse(fechaProgramada) <= Date.now())
    )
      return setError('Indica una fecha y hora futura.');

    try {
      await registrar.mutateAsync({
        id_inventario: inventario.id_inventario,
        tipo,
        cantidad,
        referencia,
        observacion,
        fecha_programada: fechaProgramada ? new Date(fechaProgramada).toISOString() : null,
      });
      toast.exito('Movimiento registrado.');
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos registrar el movimiento.');
    }
  }

  return (
    <Modal
      abierto={inventario !== null}
      titulo="Registrar movimiento de inventario"
      onCerrar={() => !registrar.isPending && onCerrar()}
      pie={
        <>
          <button type="button" className="fs-btn fs-btn--contorno" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="fs-btn fs-btn--acento"
            onClick={enviar}
            disabled={registrar.isPending}
          >
            {registrar.isPending ? 'Registrando...' : 'Registrar'}
          </button>
        </>
      }
    >
      {inventario && (
        <div className="fs-pila">
          <div className="fs-alerta fs-alerta--info">
            <span>
              {inventario.producto?.nombre} - Talla {inventario.talla?.nombre} -{' '}
              {inventario.color?.nombre} - {inventario.sucursal?.nombre}. Fisico{' '}
              {inventario.cantidad_fisica}, reservado {inventario.cantidad_reservada}, disponible{' '}
              {stockDisponible(inventario)}.
            </span>
          </div>

          {error && <div className="fs-alerta fs-alerta--error">{error}</div>}

          <div className="fs-rejilla-form">
            <div className="fs-campo">
              <label htmlFor="tipo-movimiento">Tipo</label>
              <select
                id="tipo-movimiento"
                className="fs-select"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoMovimiento)}
              >
                {TIPOS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.texto}
                  </option>
                ))}
              </select>
              {ayuda && <span className="fs-campo-ayuda">{ayuda}</span>}
            </div>

            <div className="fs-campo">
              <label htmlFor="cantidad-movimiento">
                {tipo === TipoMovimiento.AJUSTE ? 'Stock fisico final' : 'Cantidad'}
              </label>
              <input
                id="cantidad-movimiento"
                type="number"
                min={tipo === TipoMovimiento.AJUSTE ? inventario.cantidad_reservada : 1}
                step={1}
                className="fs-input"
                value={cantidad}
                onChange={(e) => setCantidad(Number(e.target.value))}
              />
            </div>

            <div className="fs-campo">
              <label htmlFor="referencia-movimiento">Referencia</label>
              <input
                id="referencia-movimiento"
                maxLength={150}
                className="fs-input"
                placeholder="OC-2026-014"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
              />
            </div>

            {tipo === TipoMovimiento.INGRESO_PENDIENTE && (
              <div className="fs-campo">
                <label htmlFor="fecha-programada">Fecha programada</label>
                <input
                  id="fecha-programada"
                  type="datetime-local"
                  className="fs-input"
                  value={fechaProgramada}
                  onChange={(e) => setFechaProgramada(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="fs-campo">
            <label htmlFor="observacion-movimiento">Observacion</label>
            <textarea
              id="observacion-movimiento"
              maxLength={500}
              className="fs-textarea"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
