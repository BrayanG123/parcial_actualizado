/**
 * Precio del producto aplicando la promocion vigente.
 * La regla es la del diagrama: Producto.obtenerPrecioActual() con la ventana
 * promo_inicio..promo_fin; no existe una entidad Promocion.
 */
import { StyleSheet, Text, View } from 'react-native';
import { precioActual, promocionVigente } from '../lib/domain';
import { moneda } from '../lib/format';
import type { Producto } from '../types/domain';
import { colores, esp, texto } from '../theme';

interface Props {
  producto: Producto;
  tamano?: 'normal' | 'grande';
}

export function Precio({ producto, tamano = 'normal' }: Props) {
  const enPromocion = promocionVigente(producto);
  const final = precioActual(producto);
  const grande = tamano === 'grande';

  return (
    <View style={estilos.fila}>
      <Text style={[estilos.final, grande && estilos.finalGrande]}>{moneda(final)}</Text>
      {enPromocion ? (
        <Text style={[estilos.original, grande && estilos.originalGrande]}>{moneda(producto.precio)}</Text>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'baseline', gap: esp.s, flexWrap: 'wrap' },
  final: { ...texto.subtitulo, fontSize: 15, color: colores.tinta },
  finalGrande: { fontSize: 24, fontFamily: undefined, fontWeight: '700' },
  original: { ...texto.menor, textDecorationLine: 'line-through', color: colores.tinta3 },
  originalGrande: { fontSize: 15 },
});
