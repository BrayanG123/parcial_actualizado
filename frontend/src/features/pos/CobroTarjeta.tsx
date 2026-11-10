import { useMemo, useRef, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';
import { moneda } from '../../lib/format';
import type { IntentoTarjetaPOS } from '../../services/pos.service';

/**
 * Formulario de tarjeta de la caja. Cada cobro crea un formulario nuevo (sin tarjetas
 * guardadas): el cajero ingresa los datos que le da el cliente y Stripe autoriza el total.
 * La venta se registra recien cuando el backend confirma esa autorizacion.
 */
export function CobroTarjeta({
  intento,
  deshabilitado,
  onAutorizado,
}: {
  intento: IntentoTarjetaPOS;
  deshabilitado: boolean;
  onAutorizado: (paymentIntentId: string) => void;
}) {
  const stripe = useMemo(
    () => loadStripe(intento.publishableKey, { locale: 'es' }).catch(() => null),
    [intento.publishableKey],
  );
  return (
    <Elements
      key={intento.clientSecret}
      stripe={stripe}
      options={{ clientSecret: intento.clientSecret, locale: 'es' }}
    >
      <Formulario intento={intento} deshabilitado={deshabilitado} onAutorizado={onAutorizado} />
    </Elements>
  );
}

function Formulario({
  intento,
  deshabilitado,
  onAutorizado,
}: {
  intento: IntentoTarjetaPOS;
  deshabilitado: boolean;
  onAutorizado: (paymentIntentId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const lock = useRef(false);
  const [listo, setListo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');

  async function autorizar() {
    if (!stripe || !elements || lock.current) return;
    lock.current = true;
    setOcupado(true);
    setError('');
    try {
      const r = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/caja` },
        redirect: 'if_required',
      });
      if (r.error) {
        setError(r.error.message ?? 'La tarjeta fue rechazada. Prueba con otra tarjeta.');
        return;
      }
      if (r.paymentIntent && ['requires_capture', 'succeeded'].includes(r.paymentIntent.status))
        onAutorizado(r.paymentIntent.id);
      else setError('El banco no autorizo el pago. Prueba con otra tarjeta.');
    } catch {
      setError('No se pudo contactar con el procesador de pagos. Revisa la conexion.');
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }

  return (
    <div className="fs-pila fs-pos-tarjeta">
      <strong>Datos de la tarjeta</strong>
      {!listo && <p className="fs-sub">Cargando el formulario seguro de pago...</p>}
      <PaymentElement
        options={{
          layout: 'tabs',
          // Sin Link: no se ofrece guardar ni autocompletar tarjetas de clientes anteriores.
          wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
        }}
        onReady={() => setListo(true)}
        onLoadError={() =>
          setError('No se pudo cargar el formulario de tarjeta. Comprueba la conexion.')
        }
      />
      {error && (
        <p role="alert" className="fs-campo-error">
          {error}
        </p>
      )}
      <button
        type="button"
        className="fs-btn fs-btn--acento"
        disabled={!stripe || !elements || !listo || ocupado || deshabilitado}
        onClick={autorizar}
      >
        {ocupado ? 'Procesando pago...' : `Cobrar ${moneda(intento.amount, intento.currency)}`}
      </button>
      <p className="fs-sub">
        Los datos de la tarjeta van directo al procesador de pagos; FashionStore no los guarda.
      </p>
    </div>
  );
}
