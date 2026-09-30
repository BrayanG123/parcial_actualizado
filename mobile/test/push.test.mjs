import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RegistroPush } from '../src/lib/registro-push.ts';
import { destinoPush } from '../src/lib/push-datos.ts';

function entorno() {
  const llamadas = [];
  let token = null;
  const transporte = {
    leer: async () => token,
    guardar: async (t) => { token = t; },
    alta: async (t, jwt) => { llamadas.push(['alta', t, jwt]); },
    baja: async (t, jwt) => { llamadas.push(['baja', t, jwt]); },
  };
  const registro = new RegistroPush(transporte);
  registro.iniciar({ userId: 1, jwt: 'cuenta-a' });
  return { registro, transporte, llamadas };
}
test('registra una sola vez por sesion y retira al salir', async () => {
  const { registro, llamadas } = entorno();
  assert.equal(await registro.registrar('fcm-1', 'cuenta-a'), true);
  assert.equal(await registro.registrar('fcm-1', 'cuenta-a'), true);
  await registro.retirar();
  assert.deepEqual(llamadas, [['alta', 'fcm-1', 'cuenta-a'], ['baja', 'fcm-1', 'cuenta-a']]);
  assert.equal(await registro.registrar('fcm-1', 'cuenta-a'), false);
});
test('invalida un alta encolada al cambiar de cuenta', async () => {
  const { registro, llamadas } = entorno();
  const vieja = registro.registrar('fcm-1', 'cuenta-a');
  registro.iniciar({ userId: 2, jwt: 'cuenta-b' });
  assert.equal(await vieja, false);
  assert.equal(await registro.registrar('fcm-1', 'cuenta-b'), true);
  assert.deepEqual(llamadas, [['alta', 'fcm-1', 'cuenta-b']]);
});
test('una respuesta de la cuenta anterior se limpia antes del alta nueva', async () => {
  const { registro, llamadas, transporte } = entorno();
  let liberar;
  let inicio;
  const iniciada = new Promise((resolve) => { inicio = resolve; });
  transporte.alta = async (t, jwt) => {
    llamadas.push(['alta', t, jwt]);
    if (jwt === 'cuenta-a') { inicio(); await new Promise((resolve) => { liberar = resolve; }); }
  };
  const vieja = registro.registrar('fcm-1', 'cuenta-a');
  await iniciada;
  registro.iniciar({ userId: 2, jwt: 'cuenta-b' });
  const nueva = registro.registrar('fcm-1', 'cuenta-b');
  liberar();
  assert.equal(await vieja, false);
  assert.equal(await nueva, true);
  assert.deepEqual(llamadas, [
    ['alta', 'fcm-1', 'cuenta-a'], ['baja', 'fcm-1', 'cuenta-a'], ['alta', 'fcm-1', 'cuenta-b'],
  ]);
});
test('retira el token aunque el POST haya perdido su respuesta', async () => {
  const { registro, transporte, llamadas } = entorno();
  transporte.alta = async () => { throw new Error('red'); };
  await assert.rejects(registro.registrar('fcm-1', 'cuenta-a'));
  await registro.retirar();
  assert.deepEqual(llamadas, [['baja', 'fcm-1', 'cuenta-a']]);
});
test('rota tokens y puede reintentar un alta fallida', async () => {
  const { registro, transporte } = entorno();
  let intentos = 0;
  transporte.alta = async () => { if (++intentos === 1) throw new Error('red'); };
  await assert.rejects(registro.registrar('fcm-1', 'cuenta-a'));
  assert.equal(await registro.registrar('fcm-1', 'cuenta-a'), true);
  assert.equal(await registro.registrar('fcm-2', 'cuenta-a'), true);
});
const compra = { tipo: 'COMPRA_CLIENTE', saleId: '42', userId: '7', event: 'PAYMENT_CONFIRMED', eventId: 'sale-42-PAYMENT_CONFIRMED' };
test('abre unicamente destinos de compra y reserva conocidos', () => {
  assert.deepEqual(destinoPush(compra), { pantalla: 'DetalleCompra', id: 42, userId: 7, eventId: compra.eventId });
  assert.equal(destinoPush({ tipo: 'RESERVA_CLIENTE', reservationId: '2', userId: '7', event: 'READY', eventId: 'reservation-2-READY' }).pantalla, 'DetalleReserva');
});
test('acepta todos los estados de reserva y rechaza estados de compra en reservas', () => {
  for (const event of ['PENDING', 'PREPARING', 'READY', 'CUSTOMER_PRESENT', 'COMPLETED', 'CANCELLED', 'EXPIRED']) {
    const reserva = { tipo: 'RESERVA_CLIENTE', reservationId: '2', userId: '7', event, eventId: 'reservation-2-' + event };
    assert.equal(destinoPush(reserva)?.pantalla, 'DetalleReserva', event);
  }
  assert.equal(destinoPush({ tipo: 'RESERVA_CLIENTE', reservationId: '2', userId: '7', event: 'ORDER_PLACED', eventId: 'reservation-2-ORDER_PLACED' }), null);
});
test('rechaza rutas arbitrarias, destinatarios ausentes y datos malformados', () => {
  for (const d of [null, {}, { url: 'https://externo.test' }, { ...compra, userId: undefined },
    { ...compra, saleId: '-1' }, { ...compra, saleId: '1.5' }, { ...compra, saleId: '9007199254740993' },
    { ...compra, event: 'DESCONOCIDO' }, { ...compra, eventId: 'otro' }, { ...compra, tipo: 'VENTA' }]) {
    assert.equal(destinoPush(d), null);
  }
});
