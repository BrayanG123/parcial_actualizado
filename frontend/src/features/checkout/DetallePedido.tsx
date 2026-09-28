import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  checkoutService,
  type IntentoStripe,
} from "../../services/checkout.service";
import { turnosService } from "../../services/turnos.service";
import { adaptarVenta } from "../../api/ventas.contratos";
import { revisionSesion } from "../../api/sesion";
import { useAuth } from "../../context/AuthContext";
import { Cargando, ErrorEstado } from "../../components/ui/Estados";
import { Confirmacion } from "../../components/ui/Modal";
import { ComprobanteVenta } from "../sales/ComprobanteVenta";
import { fechaHora, moneda } from "../../lib/format";

const PagoStripe = lazy(() => import("./PagoStripe"));
export default function DetallePedido({
  id,
  operacion = false,
}: {
  id: number;
  operacion?: boolean;
}) {
  const { usuario } = useAuth();
  return usuario ? (
    <Pedido key={`${id}:${usuario.id_usuario}`} id={id} operacion={operacion} />
  ) : null;
}
function Pedido({ id, operacion }: { id: number; operacion: boolean }) {
  const qc = useQueryClient();
  const pedido = useQuery({
    queryKey: ["pedido", id],
    queryFn: () => checkoutService.obtener(id),
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.status === "PENDING_PAYMENT" ? 4000 : false,
  });
  const turno = useQuery({
    queryKey: ["turno-actual"],
    queryFn: turnosService.actual,
    enabled: operacion,
    refetchInterval: 15000,
  });
  const [intento, setIntento] = useState<IntentoStripe | null>(null);
  const [accion, setAccion] = useState<"cancelar" | "entregar" | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const bloqueo = useRef(false);
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    // Strip Stripe return parameters, including the client secret, from history.
    const url = new URL(window.location.href);
    if (
      url.searchParams.has("payment_intent_client_secret") ||
      url.searchParams.has("redirect_status")
    ) {
      for (const key of [
        "payment_intent_client_secret",
        "payment_intent",
        "redirect_status",
      ])
        url.searchParams.delete(key);
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search + url.hash,
      );
    }
    const timer = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  async function actualizar() {
    await Promise.all(
      [
        "pedido",
        "venta",
        "ventas",
        "carrito",
        "turno-actual",
        "turnos",
        "inventario",
        "disponibilidad",
        "movimientos",
      ].map((key) => qc.invalidateQueries({ queryKey: [key] })),
    );
  }
  async function ejecutar(tipo: "pagar" | "cancelar" | "entregar") {
    if (bloqueo.current || !pedido.data) return;
    bloqueo.current = true;
    setOcupado(true);
    setError("");
    const revision = revisionSesion();
    try {
      if (tipo === "pagar") {
        const res = await checkoutService.intento(id);
        if (revision !== revisionSesion()) return;
        setIntento(res);
      } else if (tipo === "cancelar") await checkoutService.cancelar(id);
      else
        await checkoutService.entregar(id, turno.data!.id, pedido.data.total);
      if (revision !== revisionSesion()) return;
      setAccion(null);
      await actualizar();
    } catch (e) {
      if (revision === revisionSesion()) {
        setError((e as Error).message);
        await actualizar();
      }
    } finally {
      bloqueo.current = false;
      setOcupado(false);
    }
  }
  if (pedido.isPending) return <Cargando texto="Consultando pedido..." />;
  if (pedido.isError)
    return (
      <ErrorEstado error={pedido.error} onReintentar={() => pedido.refetch()} />
    );
  const venta = pedido.data!;
  const pendiente = venta.status === "PENDING_PAYMENT";
  const vencido =
    !!venta.expiresAt && new Date(venta.expiresAt).getTime() <= ahora;
  const puedeCobrar =
    turno.data &&
    turno.data.branchId === venta.branchId &&
    !turno.data.offlineActive &&
    !turno.data.closedAt;
  return (
    <div className="fs-pila">
      {error && (
        <p role="alert" className="fs-alerta fs-alerta--error">
          {error}
        </p>
      )}
      {venta.cashOnDelivery && (
        <section className="fs-panel fs-pila">
          <h2>
            {pendiente
              ? "Pendiente de entrega y cobro"
              : venta.deliveredAt
                ? "Entregado y cobrado"
                : "Pedido contra entrega cancelado"}
          </h2>
          <p>
            {venta.deliveryName} · {venta.deliveryPhone}
          </p>
          <p>{venta.deliveryAddress}</p>
          <p>
            Contra entrega en efectivo: {moneda(venta.total, venta.currency)}.
            Envio sin costo.
          </p>
          {venta.deliveredAt && (
            <p>Entrega registrada: {fechaHora(venta.deliveredAt)}</p>
          )}
          {pendiente && operacion && (
            <>
              <p>
                Confirma solo cuando las prendas hayan sido entregadas y el
                efectivo recaudado ingrese a tu caja.
              </p>
              {!puedeCobrar && (
                <p>
                  Necesitas un turno propio abierto en esta sucursal, con el
                  modo offline finalizado. <Link to="/caja">Ir a caja</Link>
                </p>
              )}
              <button
                className="fs-btn fs-btn--acento"
                disabled={!puedeCobrar || ocupado}
                onClick={() => setAccion("entregar")}
              >
                Registrar entrega y cobro
              </button>
            </>
          )}
        </section>
      )}
      {pendiente && !venta.cashOnDelivery && venta.channel !== "IN_STORE" && (
        <section className="fs-panel fs-pila">
          <h2>Pago pendiente</h2>
          <p>
            {vencido
              ? "El plazo de pago termino. Esperando la actualizacion del pedido."
              : `Completa tu pago antes de ${venta.expiresAt ? fechaHora(venta.expiresAt) : "que venza el pedido"}.`}
          </p>
          <p>
            Retiro en {venta.branch?.name}. La compra se confirma cuando la
            tienda verifica el pago.
          </p>
          {!operacion && !vencido && (
            <>
              <button
                className="fs-btn fs-btn--acento"
                disabled={ocupado}
                onClick={() => void ejecutar("pagar")}
              >
                {ocupado
                  ? "Consultando Stripe..."
                  : intento?.clientSecret
                    ? "Consultar estado del pago"
                    : "Abrir pago con Stripe"}
              </button>
              {intento?.clientSecret && (
                <Suspense fallback={<Cargando />}>
                  <PagoStripe
                    intento={intento}
                    saleId={id}
                    onConsultar={() => void pedido.refetch()}
                  />
                </Suspense>
              )}
            </>
          )}
        </section>
      )}
      {pendiente && venta.channel !== "IN_STORE" && (
        <button
          className="fs-btn fs-btn--contorno"
          disabled={ocupado}
          onClick={() => setAccion("cancelar")}
        >
          Cancelar pedido
        </button>
      )}
      {venta.status === "CANCELLED" && (
        <p>
          Pedido cancelado. Las prendas se liberaron. Si Stripe llego a cobrar,
          la tienda conciliara y reembolsara ese pago.
        </p>
      )}
      <button
        className="fs-btn fs-btn--s"
        disabled={pedido.isFetching}
        onClick={() => void pedido.refetch()}
      >
        Actualizar estado
      </button>
      <ComprobanteVenta venta={adaptarVenta(venta)} />
      <Confirmacion
        abierto={accion !== null}
        titulo={
          accion === "entregar"
            ? "Confirmar entrega y cobro"
            : "Cancelar pedido"
        }
        mensaje={
          accion === "entregar"
            ? `Se registraran ${moneda(venta.total, venta.currency)} en efectivo en tu turno. Confirma que la entrega y el cobro se realizaron.`
            : "Se liberaran las prendas apartadas. Si el pago ya se proceso, se conciliara con Stripe."
        }
        textoConfirmar={
          accion === "entregar"
            ? "Confirmar efectivo recibido"
            : "Cancelar pedido"
        }
        cargando={ocupado}
        onConfirmar={() => {
          if (accion) void ejecutar(accion);
        }}
        onCancelar={() => {
          if (!ocupado) setAccion(null);
        }}
      />
    </div>
  );
}
