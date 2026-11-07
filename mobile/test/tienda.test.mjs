import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarCodigo, validarCodigo } from '../src/lib/tienda.ts';

test('normaliza el codigo de tienda escrito por el usuario', () => {
  assert.equal(normalizarCodigo('  Empresa-B '), 'empresa-b');
});

test('acepta los codigos que valida el backend y rechaza el resto', () => {
  for (const ok of ['fashionstore', 'empresa-b', 'tienda2', 'a']) assert.equal(validarCodigo(ok), undefined, ok);
  assert.equal(validarCodigo(''), 'Ingresa el codigo de la tienda');
  for (const malo of ['-empresa', 'empresa-', 'mi tienda', 'tienda_1', 'ñandu', 'x'.repeat(61)])
    assert.ok(validarCodigo(malo), malo);
});
