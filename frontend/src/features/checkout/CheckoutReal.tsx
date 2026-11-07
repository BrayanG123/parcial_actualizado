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
import {
  fijarSucursalTienda,
  useSucursalTienda,
} from "../../lib/sucursal-tienda";

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
  const elegida = useSucursalTienda();
  const sucursal = elegida?.id_sucursal ?? 0;
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

  // Si algo se agoto en la sucursal del cliente justo antes de pagar, se ofrecen las
  // sucursales que pueden atender todo el carrito (sin pedir elegir sucursal de antemano).
  const faltaEnSucursal =
    carrito.detalles.length > 0 &&
    carrito.data?.sucursales_disponibles !== undefined &&
    !carrito.data.sucursales_disponibles.some((s) => s.id_sucursal === sucursal);
  const sinStock =
    faltaEnSucursal ||
    (cotizacion.isError && /stock|existencia|disponib|insufficient/i.test(String(cotizacion.error?.message)));
  const otras = (carrito.data?.sucursales_disponibles ?? []).filter(
    (s) => s.id_sucursal !== sucursal,
  );

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
          <p>
            Sucursal: <strong>{elegida?.nombre}</strong>
            {elegida?.ciudad ? ` · ${elegida.ciudad}` : ""}
          </p>
          {sinStock && (
            <div role="alert" className="fs-alerta fs-alerta--error fs-pila">
              <span>
                Algunas prendas se agotaron en {elegida?.nombre} mientras
                comprabas.
                {otras.length > 0
                  ? " Puedes completar tu compra en otra sucursal que si las tiene:"
                  : " Ajusta las cantidades en tu carrito."}
              </span>
              {otras.length > 0 && (
                <div className="fs-fila" style={{ gap: 8, flexWrap: "wrap" }}>
                  {otras.map((s) => (
                    <button
                      key={s.id_sucursal}
                      type="button"
                      className="fs-btn fs-btn--contorno fs-btn--s"
                      onClick={() => fijarSucursalTienda(s)}
                    >
                      Cambiar a {s.nombre}
                    </button>
                  ))}
                </div>
              )}
              <Link to="/carrito">Revisar mi carrito</Link>
            </div>
          )}
          <label>
            <input
              type="radio"
              name="pago"
              checked={metodo === "STRIPE"}
              onChange={() => setMetodo("STRIPE")}
            />{" "}
            Tarjeta de credito o debito · retiro en sucursal
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
                Ingresas los datos de tu tarjeta en el siguiente paso, en un
                formulario de pago seguro. Si el pago no se completa a tiempo,
                el pedido se cancela y las prendas se liberan.
              </p>
              {stripe.isError && (
                <p role="alert">
                  El pago con tarjeta no esta disponible en este momento.
                  Reintenta en unos minutos o paga contra entrega.{" "}
                  <button
                    type="button"
                    className="fs-btn fs-btn--s"
                    onClick={() => void stripe.refetch()}
                  >
                    Reintentar
                  </button>
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                Envio sin costo dentro de la ciudad de la sucursal. Coordinamos la entrega por telefono. Pagas en efectivo
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
        {cotizacion.isFetching && (
          <Cargando texto="Verificando precios y existencias..." />
        )}
        {cotizacion.isError && !sinStock && (
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
            sinStock ||
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
