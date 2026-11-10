import { useMemo, useRef, useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js/pure';
import {
  precioUsd,
  suscripcionService,
  type CobroSuscripcion,
  type PagoSuscripcion as Pago,
} from '../../services/suscripcion.service';
import { ErrorApi } from '../../types/api';

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pago de una suscripcion con tarjeta (Stripe, modo prueba). Tras cobrar, consulta al
 * backend hasta que aplica el cambio (crear la empresa, cambiar o renovar el plan).
 * No ofrece guardar la tarjeta: cada pago pide sus datos.
 */
export function PagoSuscripcion({
  cobro,
  titulo,
  onPagado,
  onCancelar,
}: {
  cobro: CobroSuscripcion;
  titulo: string;
  onPagado: (pago: Pago) => void;
  onCancelar?: () => void;
}) {
  const stripe = useMemo(
    () => loadStripe(cobro.publishableKey, { locale: 'es' }).catch(() => null),
    [cobro.publishableKey],
  );
  return (
    <Elements
      key={cobro.clientSecret}
      stripe={stripe}
      options={{ clientSecret: cobro.clientSecret, locale: 'es' }}
    >
      <Formulario cobro={cobro} titulo={titulo} onPagado={onPagado} onCancelar={onCancelar} />
    </Elements>
  );
}

function Formulario({
  cobro,
  titulo,
  onPagado,
  onCancelar,
}: {
  cobro: CobroSuscripcion;
  titulo: string;
  onPagado: (pago: Pago) => void;
  onCancelar?: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const lock = useRef(false);
  const [listo, setListo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [cobrado, setCobrado] = useState(false);
  const [error, setError] = useState('');

  /** El backend aplica el cambio al ver el cobro en Stripe; se consulta unos segundos. */
  async function verificar() {
    for (let intento = 0; intento < 8; intento++) {
      const pago = await suscripcionService.confirmar(cobro.paymentId);
      if (pago.status === 'PAID') return onPagado(pago);
      if (pago.status === 'FAILED' || pago.status === 'REFUNDED') {
        setError(
          `${pago.failureReason ?? 'No se pudo aplicar el pago.'}${
            pago.status === 'REFUNDED' ? ' El cobro fue reembolsado.' : ''
          }`,
        );
        return;
      }
      await espera(1500);
    }
    setError(
      'El pago se registro en Stripe pero aun no se confirma. Pulsa "Verificar pago" en unos segundos.',
    );
  }

  async function pagar() {
    if (!stripe || !elements || lock.current) return;
    lock.current = true;
    setOcupado(true);
    setError('');
    try {
      if (!cobrado) {
        const r = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: 'if_required',
        });
        if (r.error) {
          setError(r.error.message ?? 'La tarjeta fue rechazada. Prueba con otra tarjeta.');
          return;
        }
        setCobrado(true);
      }
      await verificar();
    } catch (e) {
      setError(
        e instanceof ErrorApi ? e.mensajes.join(' ') : 'No se pudo confirmar el pago. Reintenta.',
      );
    } finally {
      lock.current = false;
      setOcupado(false);
    }
  }

  const total = precioUsd(cobro.amount, cobro.currency);
  return (
    <div className="fs-pila fs-pago-suscripcion">
      <div>
        <h2 style={{ fontSize: '1.2rem' }}>{titulo}</h2>
        <p className="fs-sub">
          Plan {cobro.plan.name} · {cobro.months} {cobro.months === 1 ? 'mes' : 'meses'} ·{' '}
          <strong>{total}</strong>
        </p>
      </div>
      {!listo && <p className="fs-sub">Cargando el formulario seguro de pago...</p>}
      {!cobrado && (
        <PaymentElement
          options={{
            layout: 'tabs',
            wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
          }}
          onReady={() => setListo(true)}
          onLoadError={() =>
            setError('No se pudo cargar el formulario de pago. Comprueba la conexion.')
          }
        />
      )}
      {cobrado && !error && <p role="status">Pago recibido. Activando tu suscripcion...</p>}
      {error && (
        <p role="alert" className="fs-alerta fs-alerta--error">
          {error}
        </p>
      )}
      <div className="fs-fila" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="fs-btn fs-btn--acento"
          disabled={!stripe || !elements || (!listo && !cobrado) || ocupado}
          onClick={pagar}
        >
          {ocupado ? 'Procesando...' : cobrado ? 'Verificar pago' : `Pagar ${total}`}
        </button>
        {onCancelar && !cobrado && (
          <button type="button" className="fs-btn fs-btn--fantasma" disabled={ocupado} onClick={onCancelar}>
            Cancelar
          </button>
        )}
      </div>
      <p className="fs-sub">
        Pago seguro procesado por Stripe (modo prueba: usa la tarjeta 4242 4242 4242 4242). No
        guardamos los datos de tu tarjeta.
      </p>
    </div>
  );
}
