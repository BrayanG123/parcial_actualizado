import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCarrito } from "../../hooks/useComercio";
import { Cargando, ErrorEstado } from "../../components/ui/Estados";
import {
  checkoutService,
  type PedidoCheckout,
} from "../../services/checkout.service";
import {
  borrarPedido,
  guardarPedido,
  recuperarPedido,
} from "../../lib/checkout";
import { resultadoIncierto } from "../../lib/pos";
import { revisionSesion } from "../../api/sesion";
import { moneda } from "../../lib/format";

export default function CheckoutReal() {
  const { usuario } = useAuth();
  return usuario ? (
    <FormularioCheckout key={usuario.id_usuario} userId={usuario.id_usuario} />
  ) : null;
}
function FormularioCheckout({ userId }: { userId: number }) {
  const carrito = useCarrito();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const [sucursal, setSucursal] = useState(0);
  const [metodo, setMetodo] =
    useState<PedidoCheckout["paymentOption"]>("STRIPE");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [recuperado] = useState(() => {
    try {
      return { pedido: recuperarPedido(userId), error: "" };
    } catch (e) {
      return { pedido: null, error: (e as Error).message };
    }
  });
  const [pendiente, setPendiente] = useState(recuperado.pedido);
  const [error, setError] = useState(recuperado.error);
  const [ocupado, setOcupado] = useState(false);
  const bloqueo = useRef(false);
  const cartId = carrito.data?.id_carrito;
  const cotizacion = useQuery({
    queryKey: ["checkout", cartId, sucursal, carrito.data?.detalles],
    queryFn: () => checkoutService.revisar(cartId!, sucursal),
    enabled: Boolean(
      cartId && sucursal && !pendiente && carrito.detalles.length,
    ),
    retry: false,
    staleTime: 0,
  });
  const stripe = useQuery({
    queryKey: ["stripe-config"],
    queryFn: checkoutService.configuracion,
    retry: false,
  });

  async function confirmar() {
    if (bloqueo.current || recuperado.error) return;
    if (
      !pendiente &&
      (!cotizacion.data || cotizacion.isFetching || cotizacion.isError)
    )
      return;
    bloqueo.current = true;
    setOcupado(true);
    setError("");
    const revision = revisionSesion();
    try {
      const datos: PedidoCheckout = pendiente ?? {
        cartId: cartId!,
        branchId: sucursal,
        channel: "WEB",
        quoteHash: cotizacion.data!.quoteHash,
        idempotencyKey: crypto.randomUUID(),
        paymentOption: metodo,
        ...(metodo === "CASH_ON_DELIVERY"
          ? {
              deliveryName: nombre.trim(),
              deliveryPhone: telefono.trim(),
              deliveryAddress: direccion.trim(),
            }
          : {}),
      };
      guardarPedido(userId, datos);
      setPendiente(datos);
      const venta = await checkoutService.crear(datos);
      if (revision !== revisionSesion()) return;
      borrarPedido(userId);
      setPendiente(null);
      void qc.invalidateQueries({ queryKey: ["carrito"] });
      void qc.invalidateQueries({ queryKey: ["ventas"] });
      navegar(`/mis-compras/${venta.id}`, { replace: true });
    } catch (e) {
      if (revision !== revisionSesion()) return;
      setError((e as Error).message);
      if (!resultadoIncierto(e)) {
        borrarPedido(userId);
        setPendiente(null);
        void carrito.refetch();
        void cotizacion.refetch();
      }
    } finally {
      bloqueo.current = false;
      setOcupado(false);
    }
  }
  if (pendiente || recuperado.error)
    return (
      <div className="fs-contenedor fs-seccion fs-pila">
        <h1>Recuperar pedido</h1>
        <p>
          La respuesta anterior no se pudo confirmar. Reintenta el mismo pedido
          para consultar su resultado sin duplicarlo.
        </p>
        {error && (
          <p role="alert" className="fs-alerta fs-alerta--error">
            {error}
          </p>
        )}
        <button
          className="fs-btn fs-btn--acento"
          disabled={ocupado || !!recuperado.error}
          onClick={() => void confirmar()}
        >
          Reintentar pedido
        </button>
        <Link to="/mis-compras">Ver mis compras</Link>
      </div>
    );
  if (carrito.isPending) return <Cargando />;
  if (carrito.isError)
    return (
      <ErrorEstado
        error={carrito.error}
        onReintentar={() => carrito.refetch()}
      />
    );
  if (!carrito.detalles.length)
    return (
      <div className="fs-contenedor fs-seccion">
        <h1>Tu carrito esta vacio</h1>
        <Link to="/mis-compras">Ver mis pedidos</Link> ·{" "}
        <Link to="/catalogo">Ir al catalogo</Link>
      </div>
    );
  return (
    <form
      className="fs-contenedor fs-compra"
      onSubmit={(e) => {
        e.preventDefault();
        void confirmar();
      }}
    >
      <section className="fs-pila">
        <h1>Finalizar compra</h1>
        {error && (
          <p role="alert" className="fs-alerta fs-alerta--error">
            {error}
          </p>
        )}
        <fieldset className="fs-panel fs-pila" disabled={ocupado}>
          <legend>Entrega y pago</legend>
          <label className="fs-campo">
            Sucursal que atiende el pedido
            <select
              className="fs-select"
              required
              value={sucursal || ""}
              onChange={(e) => setSucursal(Number(e.target.value))}
            >
              <option value="">Selecciona una sucursal</option>
              {carrito.data?.sucursales_disponibles?.map((s) => (
                <option value={s.id_sucursal} key={s.id_sucursal}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          {carrito.data?.tiene_disponibilidad === false && (
            <p role="alert">
              Ninguna sucursal tiene todo el carrito disponible. Ajusta las
              cantidades.
            </p>
          )}
          <label>
            <input
              type="radio"
              name="pago"
              checked={metodo === "STRIPE"}
              onChange={() => setMetodo("STRIPE")}
            />{" "}
            Tarjeta con Stripe (prueba) · retiro en sucursal
          </label>
          <label>
            <input
              type="radio"
              name="pago"
              checked={metodo === "CASH_ON_DELIVERY"}
              onChange={() => setMetodo("CASH_ON_DELIVERY")}
            />{" "}
            Efectivo contra entrega · envio a domicilio
          </label>
          {metodo === "STRIPE" ? (
            <>
              <p>
                Introduce tu tarjeta en el formulario seguro de Stripe despues
                de revisar y crear el pedido. El pedido vence si no se paga a
                tiempo.
              </p>
              {stripe.isError && (
                <p role="alert">
                  Stripe no esta disponible. Puedes reintentar o elegir contra
                  entrega.{" "}
                  <button
                    type="button"
                    className="fs-btn fs-btn--s"
                    onClick={() => void stripe.refetch()}
                  >
                    Revisar Stripe
                  </button>
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                Envio sin costo para la demostracion, dentro de la ciudad de la
                sucursal. Coordinamos la entrega por telefono. Pagas en efectivo
                al recibir; el pedido queda pendiente hasta confirmar entrega y
                cobro.
              </p>
              <label className="fs-campo">
                Destinatario
                <input
                  className="fs-input"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                />
              </label>
              <label className="fs-campo">
                Telefono
                <input
                  className="fs-input"
                  type="tel"
                  autoComplete="tel"
                  required
                minLength={6}
                  maxLength={30}
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </label>
              <label className="fs-campo">
                Direccion y referencia
                <textarea
                  className="fs-input"
                  autoComplete="street-address"
                  required
                  minLength={10}
                  maxLength={250}
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                />
              </label>
            </>
          )}
        </fieldset>
        <Link to="/carrito">Volver al carrito</Link>
      </section>
      <aside className="fs-panel fs-resumen fs-pila">
        <h2>Revisa tu pedido</h2>
        {!sucursal && (
          <p>Selecciona una sucursal para confirmar precios y existencias.</p>
        )}
        {sucursal > 0 && cotizacion.isFetching && (
          <Cargando texto="Verificando precios y stock..." />
        )}
        {cotizacion.isError && (
          <ErrorEstado
            error={cotizacion.error}
            onReintentar={() => cotizacion.refetch()}
          />
        )}
        {cotizacion.data && !cotizacion.isError && (
          <>
            {cotizacion.data.items.map((i) => (
              <p key={`${i.productId}:${i.sizeId}:${i.colorId}`}>
                {i.quantity} × {i.productName} ({i.sizeName} / {i.colorName}){" "}
                <strong>{moneda(i.subtotal, cotizacion.data.currency)}</strong>
              </p>
            ))}
            <p className="fs-resumen__total">
              Total: {moneda(cotizacion.data.total, cotizacion.data.currency)}
            </p>
          </>
        )}
        <button
          className="fs-btn fs-btn--acento"
          disabled={
            ocupado ||
            !cotizacion.data ||
            cotizacion.isFetching ||
            cotizacion.isError ||
            (metodo === "STRIPE" && !stripe.data)
          }
        >
          {ocupado
            ? "Creando pedido..."
            : metodo === "STRIPE"
              ? "Crear pedido y pagar"
              : "Confirmar pedido contra entrega"}
        </button>
      </aside>
    </form>
  );
}
