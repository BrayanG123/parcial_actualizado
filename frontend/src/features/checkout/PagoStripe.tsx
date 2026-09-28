import { useMemo, useRef, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js/pure";
import type { IntentoStripe } from "../../services/checkout.service";

export default function PagoStripe({
  intento,
  saleId,
  onConsultar,
}: {
  intento: IntentoStripe;
  saleId: number;
  onConsultar: () => void;
}) {
  const stripe = useMemo(
    () =>
      intento.publishableKey
        ? loadStripe(intento.publishableKey, { locale: "es" }).catch(() => null)
        : null,
    [intento.publishableKey],
  );
  if (!intento.clientSecret || !stripe) return null;
  return (
    <Elements
      key={intento.clientSecret}
      stripe={stripe}
      options={{ clientSecret: intento.clientSecret, locale: "es" }}
    >
      <FormularioStripe saleId={saleId} onConsultar={onConsultar} />
    </Elements>
  );
}
function FormularioStripe({
  saleId,
  onConsultar,
}: {
  saleId: number;
  onConsultar: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const bloqueo = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState("");
  async function pagar() {
    if (!stripe || !elements || bloqueo.current) return;
    bloqueo.current = true;
    setOcupado(true);
    setError("");
    try {
      const resultado = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/mis-compras/${saleId}`,
        },
        redirect: "if_required",
      });
      if (resultado.error)
        setError(
          resultado.error.message ??
            "No se pudo confirmar el pago. Revisa tu tarjeta.",
        );
      else setEnviado(true);
      // Only our backend can confirm the sale; a browser response is not a receipt.
      onConsultar();
    } catch {
      setError(
        "No se pudo obtener la respuesta de Stripe. Consulta el estado antes de volver a pagar.",
      );
      onConsultar();
    } finally {
      bloqueo.current = false;
      setOcupado(false);
    }
  }
  return (
    <form
      className="fs-panel fs-pila"
      onSubmit={(e) => {
        e.preventDefault();
        void pagar();
      }}
    >
      <h3>Pago seguro con Stripe · modo prueba</h3>
      {!listo && (
        <p>
          Cargando el formulario seguro. Si no aparece, comprueba la conexion y
          vuelve a abrir el pago.
        </p>
      )}
      <PaymentElement
        onReady={() => setListo(true)}
        onLoadError={() =>
          setError(
            "No se pudo cargar el formulario de Stripe. Comprueba tu conexion.",
          )
        }
      />
      {error && (
        <p role="alert" className="fs-alerta fs-alerta--error">
          {error}
        </p>
      )}
      {enviado ? (
        <p role="status">
          Pago enviado. Esperando la confirmacion de la tienda; el estado se
          actualiza automaticamente.
        </p>
      ) : (
        <button
          className="fs-btn fs-btn--acento"
          disabled={!stripe || !elements || !listo || ocupado}
        >
          {ocupado ? "Procesando pago..." : "Pagar con tarjeta de prueba"}
        </button>
      )}
    </form>
  );
}
