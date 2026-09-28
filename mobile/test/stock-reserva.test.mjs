import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoPrendaReserva } from '../src/lib/stock-reserva.ts';
const linea = { id_producto: 1, id_talla: 2, id_color: 3, cantidad: 2 };
const fila = { ...linea, id_sucursal: 4, cantidad_fisica: 5, cantidad_reservada: 3 };
const consulta = (data) => ({ data, isSuccess: true, isError: false, isFetching: false });
test('descuenta reservas y compara sucursal y variante exactas', () => {
  const data = [fila, { ...fila, id_sucursal: 9, cantidad_fisica: 100 },
    { ...fila, id_talla: 9 }, { ...fila, id_color: 9 }, { ...fila, id_producto: 9 }];
  assert.deepEqual(estadoPrendaReserva(linea, 4, consulta(data)), { estado: 'disponible', disponible: 2 });
  assert.deepEqual(estadoPrendaReserva({ ...linea, cantidad: 3 }, 4, consulta(data)), { estado: 'insuficiente', disponible: 2 });
  assert.deepEqual(estadoPrendaReserva(linea, 8, consulta(data)), { estado: 'insuficiente', disponible: 0 });
});
test('no confirma con datos anteriores durante carga, error o sin sucursal', () => {
  assert.equal(estadoPrendaReserva(linea, undefined, consulta([fila])).estado, 'sin-sucursal');
  assert.equal(estadoPrendaReserva(linea, 4, { ...consulta([fila]), isFetching: true }).estado, 'consultando');
  assert.equal(estadoPrendaReserva(linea, 4, { ...consulta([fila]), isSuccess: false, isError: true }).estado, 'error');
  assert.equal(estadoPrendaReserva(linea, 4, { ...consulta([]), isSuccess: false }).estado, 'consultando');
});
test('variante ausente, agotada o sobre-reservada queda bloqueada sin mutar el borrador', () => {
  for (const data of [[], [{ ...fila, cantidad_fisica: 3 }], [{ ...fila, cantidad_fisica: 1 }]]) {
    assert.deepEqual(estadoPrendaReserva(linea, 4, consulta(data)), { estado: 'insuficiente', disponible: 0 });
  }
  assert.equal(linea.cantidad, 2);
});
