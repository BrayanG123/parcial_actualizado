import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fecha, moneda } from '../../lib/format';
import { useAlcanceOffline, useDatosOffline, useEnLinea } from '../../hooks/useOffline';
import { registrarCambio } from '../../offline/cola';
import { claveVariante } from '../../offline/tipos';
import { cambiosService, type CambioRegistrado, type OpcionesCambio } from '../../services/cambios.service';
import { turnosService } from '../../services/turnos.service';
import { ErrorApi } from '../../types/api';

const mensaje = (e: unknown) => (e instanceof ErrorApi ? e.mensajes.join(' ') : e instanceof Error ? e.message : 'No se pudo completar.');
const LIQUIDACION = { EVEN: 'Sin diferencia', CHARGED: 'Diferencia cobrada en efectivo', CREDIT_NOTE: 'Nota de credito emitida' };

/**
 * F7.2: cambio de prendas dentro del plazo de la empresa. Con conexion se valida y
 * registra al momento; sin conexion queda como operacion EXCHANGE para sincronizar.
 */
export default function PaginaCambios() {
  const enLinea = useEnLinea();
  return (
    <div className="fs-pila">
      <header className="fs-pagina-cabecera">
        <div>
          <p className="fs-eyebrow">Caja</p>
          <h1>Cambios de prendas</h1>
          <p className="fs-sub">
            La prenda devuelta vuelve al stock y la nueva se descuenta. Si la nueva cuesta mas se cobra la diferencia en
            efectivo; si cuesta menos se emite una nota de credito.
          </p>
        </div>
        <Link to="/caja/pendientes" className="fs-btn fs-btn--contorno">
          Pendientes offline
        </Link>
      </header>
      {enLinea ? <CambioEnLinea /> : <CambioOffline />}
      {enLinea && <NotasCredito />}
    </div>
  );
}

function CambioEnLinea() {
  const [numero, setNumero] = useState('');
  const [opciones, setOpciones] = useState<OpcionesCambio | null>(null);
  const [lineaId, setLineaId] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState(1);
  const [nueva, setNueva] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState<CambioRegistrado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const candado = useRef(false);
  const turno = useQuery({ queryKey: ['turno-actual-cambios'], queryFn: turnosService.actual });

  async function accion(fn: () => Promise<void>) {
    if (candado.current) return;
    candado.current = true;
    setOcupado(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      candado.current = false;
      setOcupado(false);
    }
  }
  const linea = opciones?.items.find((i) => i.id === lineaId);
  const candidata = opciones?.candidates.find((c) => claveVariante(c) === nueva);
  const diferencia =
    linea && candidata ? Math.round((Number(candidata.unitPrice) - Number(linea.paidUnitPrice)) * 100 * cantidad) / 100 : 0;

  return (
    <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
      <h2 className="fs-titulo-seccion">Cambio con conexion</h2>
      {error && <div className="fs-alerta fs-alerta--error">{error}</div>}
      {hecho && (
        <div className="fs-alerta fs-alerta--exito" role="status">
          Cambio #{hecho.id} registrado: {LIQUIDACION[hecho.settlement]}
          {hecho.settlement !== 'EVEN' && ` (${moneda(Math.abs(Number(hecho.difference)))})`}
          {hecho.creditNote && `. Codigo de la nota: ${hecho.creditNote.code}`}
        </div>
      )}
      <div className="fs-fila-wrap">
        <input
          className="fs-input"
          aria-label="Numero de venta"
          placeholder="Numero de venta"
          inputMode="numeric"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
        />
        <button
          type="button"
          className="fs-btn fs-btn--contorno"
          disabled={ocupado || !Number(numero)}
          onClick={() =>
            accion(async () => {
              setHecho(null);
              setLineaId(null);
              setNueva('');
              setOpciones(await cambiosService.opciones(Number(numero)));
            })
          }
        >
          Buscar venta
        </button>
      </div>
      {opciones && (
        <>
          <p>
            Venta #{opciones.sale.id} del {fecha(opciones.sale.soldAt)} · plazo de {opciones.windowDays} dias hasta el{' '}
            {fecha(opciones.deadline)}{' '}
            <span className={`fs-badge ${opciones.withinWindow ? 'fs-badge--exito' : 'fs-badge--error'}`}>
              {opciones.withinWindow ? 'Dentro del plazo' : 'Fuera de plazo'}
            </span>
          </p>
          <label className="fs-campo">
            Prenda que devuelve
            <select className="fs-input" value={lineaId ?? ''} onChange={(e) => setLineaId(Number(e.target.value) || null)}>
              <option value="">Elegir</option>
              {opciones.items.map((i) => (
                <option key={i.id} value={i.id} disabled={i.exchangeable === 0}>
                  {i.productName} ({i.sizeName} / {i.colorName}) · pagado {moneda(Number(i.paidUnitPrice))} · cambiables{' '}
                  {i.exchangeable}
                </option>
              ))}
            </select>
          </label>
          <label className="fs-campo">
            Cantidad
            <input
              type="number"
              min={1}
              max={linea?.exchangeable ?? 1}
              className="fs-input"
              value={cantidad}
              onChange={(e) => setCantidad(Number(e.target.value))}
            />
          </label>
          <label className="fs-campo">
            Prenda que lleva
            <select className="fs-input" value={nueva} onChange={(e) => setNueva(e.target.value)}>
              <option value="">Elegir</option>
              {opciones.candidates.map((c) => (
                <option key={claveVariante(c)} value={claveVariante(c)}>
                  {c.productName} ({c.sizeName} / {c.colorName}) · {moneda(Number(c.unitPrice))} · stock {c.available}
                </option>
              ))}
            </select>
          </label>
          <label className="fs-campo">
            Motivo (opcional)
            <input className="fs-input" maxLength={250} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          {linea && candidata && (
            <p>
              <strong>
                {diferencia > 0
                  ? `Cobrar ${moneda(diferencia)} en efectivo`
                  : diferencia < 0
                    ? `Nota de credito por ${moneda(-diferencia)}`
                    : 'Sin diferencia de precio'}
              </strong>
              {diferencia > 0 && !turno.data && ' · abre tu turno en Punto de venta para cobrar la diferencia'}
            </p>
          )}
          {opciones.exchanges.length > 0 && (
            <p className="fs-sub">
              Cambios anteriores: {opciones.exchanges.map((x) => `#${x.id} ${x.newProductName}`).join(', ')}
            </p>
          )}
          <button
            type="button"
            className="fs-btn fs-btn--acento"
            disabled={ocupado || !linea || !candidata || !opciones.withinWindow || cantidad < 1 || (diferencia > 0 && !turno.data)}
            onClick={() =>
              accion(async () => {
                const r = await cambiosService.crear({
                  saleId: opciones.sale.id,
                  saleItemId: linea!.id,
                  quantity: cantidad,
                  newProductId: candidata!.productId,
                  newSizeId: candidata!.sizeId,
                  newColorId: candidata!.colorId,
                  ...(diferencia > 0 && turno.data ? { shiftId: turno.data.id } : {}),
                  ...(motivo.trim() ? { reason: motivo.trim() } : {}),
                  expectedDifference: diferencia,
                });
                setHecho(r);
                setOpciones(await cambiosService.opciones(opciones.sale.id));
              })
            }
          >
            Registrar cambio
          </button>
        </>
      )}
    </section>
  );
}

function CambioOffline() {
  const { usuario } = useAuth();
  const alcance = useAlcanceOffline();
  const { snapshot } = useDatosOffline(alcance);
  const [venta, setVenta] = useState('');
  const [devuelta, setDevuelta] = useState('');
  const [nueva, setNueva] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const candado = useRef(false);
  if (!snapshot)
    return (
      <section className="fs-tarjeta fs-tarjeta--pad">
        <p>Sin conexion y sin datos descargados. Descarga tu sucursal en Ventas offline cuando tengas conexion.</p>
      </section>
    );
  const variante = (clave: string) => snapshot.variants.find((v) => claveVariante(v) === clave);
  return (
    <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
      <h2 className="fs-titulo-seccion">Cambio sin conexion</h2>
      <p className="fs-sub">
        Se guarda en este navegador. Al sincronizar, el servidor valida plazo, cantidades y precios y calcula la diferencia.
      </p>
      {error && <div className="fs-alerta fs-alerta--error">{error}</div>}
      {aviso && (
        <div className="fs-alerta fs-alerta--exito" role="status">
          {aviso}
        </div>
      )}
      <input
        className="fs-input"
        aria-label="Numero de venta offline"
        placeholder="Numero de venta (del comprobante)"
        inputMode="numeric"
        value={venta}
        onChange={(e) => setVenta(e.target.value)}
      />
      {[
        ['Prenda que devuelve', devuelta, setDevuelta],
        ['Prenda que lleva', nueva, setNueva],
      ].map(([etiqueta, valor, cambiar]) => (
        <label key={etiqueta as string} className="fs-campo">
          {etiqueta as string}
          <select className="fs-input" value={valor as string} onChange={(e) => (cambiar as (v: string) => void)(e.target.value)}>
            <option value="">Elegir</option>
            {snapshot.variants.map((v) => (
              <option key={claveVariante(v)} value={claveVariante(v)}>
                {v.productName} ({v.sizeName} / {v.colorName}) · {moneda(v.netUnitPrice)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="fs-campo">
        Cantidad
        <input type="number" min={1} className="fs-input" value={cantidad} onChange={(e) => setCantidad(Number(e.target.value))} />
      </label>
      <input className="fs-input" placeholder="Motivo (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <button
        type="button"
        className="fs-btn fs-btn--acento"
        disabled={!venta || !devuelta || !nueva}
        onClick={async () => {
          if (candado.current) return;
          candado.current = true;
          setError('');
          try {
            const op = await registrarCambio(alcance!, snapshot, {
              ventaId: Number(venta),
              devuelta: variante(devuelta)!,
              nueva: variante(nueva)!,
              cantidad,
              motivo,
              usuarioId: usuario?.id_usuario,
            });
            setAviso(`Cambio guardado (${op.operationId.slice(0, 8)}). Se enviara al recuperar la conexion.`);
            setVenta('');
            setDevuelta('');
            setNueva('');
          } catch (e) {
            setError(mensaje(e));
          } finally {
            candado.current = false;
          }
        }}
      >
        Guardar cambio offline
      </button>
    </section>
  );
}

/** F7.3 (aporte propio): consulta y canje de notas de credito. */
function NotasCredito() {
  const [codigo, setCodigo] = useState('');
  const [monto, setMonto] = useState('');
  const [nota, setNota] = useState<{ code: string; amount: string; balance: string; status: string } | null>(null);
  const [error, setError] = useState('');
  async function ejecutar(fn: () => Promise<void>) {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(mensaje(e));
    }
  }
  return (
    <section className="fs-tarjeta fs-tarjeta--pad fs-pila">
      <h2 className="fs-titulo-seccion">Notas de credito</h2>
      {error && <div className="fs-alerta fs-alerta--error">{error}</div>}
      <div className="fs-fila-wrap">
        <input className="fs-input" aria-label="Codigo de nota" placeholder="NC-XXXXXXXX" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        <button type="button" className="fs-btn fs-btn--contorno" disabled={!codigo} onClick={() => ejecutar(async () => setNota(await cambiosService.notaCredito(codigo)))}>
          Consultar
        </button>
      </div>
      {nota && (
        <>
          <p>
            {nota.code}: emitida por {moneda(Number(nota.amount))}, saldo <strong>{moneda(Number(nota.balance))}</strong> ·{' '}
            {nota.status === 'ACTIVE' ? 'vigente' : 'usada'}
          </p>
          <div className="fs-fila-wrap">
            <input className="fs-input" type="number" min="0.01" step="0.01" aria-label="Monto a canjear" value={monto} onChange={(e) => setMonto(e.target.value)} />
            <button
              type="button"
              className="fs-btn fs-btn--acento"
              disabled={!Number(monto) || nota.status !== 'ACTIVE'}
              onClick={() =>
                ejecutar(async () => {
                  const r = await cambiosService.canjear(nota.code, Number(monto));
                  setNota({ ...nota, balance: String(r.balance), status: r.status });
                  setMonto('');
                })
              }
            >
              Canjear como pago
            </button>
          </div>
        </>
      )}
    </section>
  );
}
