import { USAR_MOCKS } from '../../api/config';
import CheckoutReal from './CheckoutReal';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Confirmacion } from '../../components/ui/Modal';
import { Cargando, Vacio } from '../../components/ui/Estados';
import { useToast } from '../../context/ToastContext';
import { useCarrito, useRegistrarVenta } from '../../hooks/useComercio';
import { useSucursales } from '../../hooks/useOperaciones';
import { moneda } from '../../lib/format';
import { CanalVenta, MetodoPago } from '../../types/domain';

/** Metodos habilitados para la compra web mientras no exista pasarela real. */
const METODOS = [
  {
    valor: MetodoPago.PASARELA,
    titulo: 'Pasarela en linea',
    detalle: 'Se confirmara con la respuesta del backend',
  },
  {
    valor: MetodoPago.TARJETA,
    titulo: 'Tarjeta de credito o debito',
    detalle: 'Cobro procesado por la tienda',
  },
  { valor: MetodoPago.QR, titulo: 'Pago con QR', detalle: 'Escanea desde tu banca movil' },
  {
    valor: MetodoPago.TRANSFERENCIA,
    titulo: 'Transferencia bancaria',
    detalle: 'Confirmacion sujeta a validacion',
  },
];

export default function PaginaCheckout() {
  return USAR_MOCKS ? (
    <CheckoutDemo />
  ) : (
    <CheckoutReal />
  );
}

function CheckoutDemo() {
  const carrito = useCarrito();
  const sucursales = useSucursales();
  const registrar = useRegistrarVenta();
  const toast = useToast();
  const navegar = useNavigate();

  const [idSucursal, setIdSucursal] = useState<number | ''>('');
  const [metodo, setMetodo] = useState<MetodoPago>(MetodoPago.PASARELA);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');

  if (carrito.isPending) return <Cargando texto="Preparando tu compra..." />;

  if (carrito.detalles.length === 0) {
    return (
      <div className="fs-contenedor" style={{ padding: '48px 0' }}>
        <Vacio
          titulo="No hay prendas para pagar"
          mensaje="Agrega prendas al carrito antes de continuar con la compra."
          accion={
            <Link to="/catalogo" className="fs-btn fs-btn--acento">
              Ir al catalogo
            </Link>
          }
        />
      </div>
    );
  }

  async function confirmar() {
    if (!idSucursal) {
      setError('Selecciona la sucursal desde la que se despachara tu pedido.');
      setConfirmando(false);
      return;
    }
    try {
      const venta = await registrar.mutateAsync({
        canal: CanalVenta.WEB,
        id_sucursal: Number(idSucursal),
        detalles: carrito.detalles.map((d) => ({
          id_producto: d.id_producto,
          id_talla: d.id_talla,
          id_color: d.id_color,
          cantidad: d.cantidad,
        })),
        pago: { metodo },
      });
      toast.exito('Compra registrada correctamente.');
      navegar(`/mis-compras/${venta.id_venta}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos procesar tu compra.');
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <div className="fs-contenedor fs-compra">
      <section className="fs-pila" style={{ gap: 20 }}>
        <div>
          <p className="fs-eyebrow">Compra web</p>
          <h1>Finalizar compra</h1>
        </div>

        {error && <div className="fs-alerta fs-alerta--error">{error}</div>}

        <div className="fs-panel">
          <h3>Sucursal de despacho</h3>
          <p className="fs-sub">El stock se descuenta de la tienda que atiende tu pedido.</p>
          <div className="fs-campo">
            <label htmlFor="sucursal">Sucursal</label>
            <select
              id="sucursal"
              className="fs-select"
              value={idSucursal}
              onChange={(e) => setIdSucursal(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">Selecciona una sucursal</option>
              {sucursales.data?.map((s) => (
                <option key={s.id_sucursal} value={s.id_sucursal}>
                  {s.nombre} - {s.ciudad}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="fs-panel">
          <h3>Metodo de pago</h3>
          <div className="fs-pila" style={{ gap: 10 }}>
            {METODOS.map((m) => (
              <label
                key={m.valor}
                className="fs-fila"
                style={{
                  border: `1px solid ${metodo === m.valor ? 'var(--fs-acento)' : 'var(--fs-borde)'}`,
                  borderRadius: 'var(--fs-radio-s)',
                  padding: 12,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="metodo"
                  value={m.valor}
                  checked={metodo === m.valor}
                  onChange={() => setMetodo(m.valor)}
                  style={{ accentColor: 'var(--fs-acento)' }}
                />
                <span className="fs-crecer">
                  <strong style={{ display: 'block', fontSize: '0.92rem' }}>{m.titulo}</strong>
                  <span className="fs-sub">{m.detalle}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="fs-campo-ayuda">
            El pago quedara registrado como PENDIENTE hasta que el backend confirme la transaccion.
          </p>
        </div>
      </section>

      <aside className="fs-panel fs-resumen">
        <h3>Tu pedido</h3>
        <div className="fs-pila" style={{ gap: 8 }}>
          {carrito.detalles.map((d) => (
            <div key={d.id_detalle_carrito} className="fs-resumen__linea">
              <span>
                {d.cantidad} x {d.producto?.nombre}
                <span className="fs-sub">
                  {' '}
                  ({d.talla?.nombre} / {d.color?.nombre})
                </span>
              </span>
              <span className="fs-nums">{moneda(d.cantidad * d.precio_unitario)}</span>
            </div>
          ))}
        </div>
        <hr className="fs-divisor" />
        <div className="fs-resumen__total">
          <span>Total</span>
          <span className="fs-nums">{moneda(carrito.total)}</span>
        </div>
        <button
          type="button"
          className="fs-btn fs-btn--acento fs-btn--bloque"
          onClick={() => setConfirmando(true)}
          disabled={registrar.isPending}
        >
          {registrar.isPending ? 'Procesando...' : 'Confirmar compra'}
        </button>
        <Link to="/carrito" className="fs-btn fs-btn--contorno fs-btn--bloque">
          Volver al carrito
        </Link>
      </aside>

      <Confirmacion
        abierto={confirmando}
        titulo="Confirmar compra"
        mensaje={`Se registrara una venta por ${moneda(carrito.total)} con el metodo seleccionado.`}
        textoConfirmar="Confirmar compra"
        cargando={registrar.isPending}
        onConfirmar={confirmar}
        onCancelar={() => setConfirmando(false)}
      />
    </div>
  );
}
