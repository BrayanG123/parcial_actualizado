/**
 * Pago con tarjeta en modo prueba.
 *
 * Se usa Stripe.js (Payment Element) dentro de un WebView en lugar del SDK
 * nativo: @stripe/stripe-react-native necesita un build de desarrollo para el
 * flujo completo, mientras que esta vista funciona en Expo Go. Los datos de la
 * tarjeta nunca pasan por la app ni por NestJS: van directo a Stripe.
 */
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Boton } from '../../components/Boton';
import { AvisoEnLinea } from '../../components/Estados';
import { colores, esp, texto } from '../../theme';

/** Stripe vuelve aqui solo si un medio exige redireccion; no es una pagina real. */
const RETORNO = 'https://fashionstore.app/pago-finalizado';

interface Props {
  publishableKey: string;
  clientSecret: string;
  monto: string;
  onPagado: () => void;
  onCancelar: () => void;
}

/** JSON seguro dentro de <script>: evita que un valor cierre la etiqueta. */
const js = (valor: string) => JSON.stringify(valor).replace(/</g, '\\u003c');

function pagina(publishableKey: string, clientSecret: string, monto: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<script src="https://js.stripe.com/v3/"></script>
<style>
  body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: ${colores.crema}; color: ${colores.tinta}; }
  button { width: 100%; margin-top: 16px; padding: 14px; border: 0; border-radius: 10px;
    background: ${colores.acento}; color: #fff; font-size: 16px; font-weight: 600; }
  button:disabled { opacity: .55; }
  #error { color: ${colores.error}; margin-top: 12px; font-size: 14px; }
  #nota { color: ${colores.tinta3}; font-size: 12px; margin-top: 12px; text-align: center; }
</style>
</head>
<body>
<form id="formulario">
  <div id="payment-element"></div>
  <button id="pagar" type="submit" disabled>Pagar ${monto.replace(/[<>&]/g, '')}</button>
  <div id="error" role="alert"></div>
  <div id="nota">Modo prueba de Stripe: usa la tarjeta 4242 4242 4242 4242, fecha futura y cualquier CVC.</div>
</form>
<script>
  const enviar = (dato) => window.ReactNativeWebView.postMessage(JSON.stringify(dato));
  const boton = document.getElementById('pagar');
  const error = document.getElementById('error');
  try {
    const stripe = Stripe(${js(publishableKey)});
    const elements = stripe.elements({ clientSecret: ${js(clientSecret)}, locale: 'es' });
    const elemento = elements.create('payment', { layout: 'tabs' });
    elemento.on('ready', () => { boton.disabled = false; enviar({ tipo: 'listo' }); });
    elemento.mount('#payment-element');
    document.getElementById('formulario').addEventListener('submit', async (evento) => {
      evento.preventDefault();
      boton.disabled = true;
      error.textContent = '';
      const resultado = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: ${js(RETORNO)} },
      });
      if (resultado.error) {
        error.textContent = resultado.error.message || 'No se pudo procesar el pago.';
        boton.disabled = false;
      } else {
        enviar({ tipo: 'pagado' });
      }
    });
  } catch (e) {
    enviar({ tipo: 'fallo', mensaje: 'No se pudo cargar Stripe.' });
  }
</script>
</body>
</html>`;
}

export function PagoStripeWeb({ publishableKey, clientSecret, monto, onPagado, onCancelar }: Props) {
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const html = useMemo(() => pagina(publishableKey, clientSecret, monto), [publishableKey, clientSecret, monto]);

  if (Platform.OS === 'web') {
    return (
      <View style={estilos.centro}>
        <AvisoEnLinea tipo="info" texto="El pago con tarjeta se prueba en el telefono con Expo Go." />
        <Boton titulo="Volver" variante="secundario" onPress={onCancelar} />
      </View>
    );
  }

  function alMensaje(evento: WebViewMessageEvent) {
    try {
      const dato = JSON.parse(evento.nativeEvent.data) as { tipo: string; mensaje?: string };
      if (dato.tipo === 'listo') setListo(true);
      else if (dato.tipo === 'pagado') onPagado();
      else if (dato.tipo === 'fallo') setFallo(dato.mensaje ?? 'No se pudo cargar el formulario de pago.');
    } catch {
      // Mensajes ajenos al formulario se ignoran.
    }
  }

  return (
    <View style={estilos.contenedor}>
      <Text style={estilos.titulo}>Pago seguro con Stripe</Text>
      {fallo ? <AvisoEnLinea texto={fallo} /> : null}
      <View style={estilos.web}>
        <WebView
          originWhitelist={['https://*']}
          source={{ html, baseUrl: 'https://fashionstore.app' }}
          onMessage={alMensaje}
          javaScriptEnabled
          domStorageEnabled
          onError={() => setFallo('No pudimos conectar con Stripe. Revisa tu conexion.')}
          onShouldStartLoadWithRequest={(req) => {
            if (req.url.startsWith(RETORNO)) {
              onPagado();
              return false;
            }
            return true;
          }}
        />
        {!listo && !fallo ? (
          <View style={estilos.capa}>
            <ActivityIndicator color={colores.acento} />
            <Text style={estilos.detalle}>Cargando formulario de pago...</Text>
          </View>
        ) : null}
      </View>
      <Boton titulo="Cancelar pago" variante="plano" onPress={onCancelar} />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, padding: esp.l, gap: esp.m, backgroundColor: colores.crema },
  titulo: { ...texto.subtitulo },
  web: { flex: 1, borderRadius: 12, overflow: 'hidden', backgroundColor: colores.crema },
  capa: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: esp.s,
    backgroundColor: colores.crema,
  },
  detalle: { ...texto.menor },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: esp.m, padding: esp.xl },
});
