import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ImagenProducto } from '../../components/ImagenProducto';
import { InsigniaDescuento } from '../../components/Insignias';
import { Precio } from '../../components/Precio';
import { promocionVigente } from '../../lib/domain';
import type { Producto } from '../../types/domain';
import { colores, esp, radio, sombra, texto } from '../../theme';

interface Props {
  producto: Producto;
  ancho: number;
  onPress: (producto: Producto) => void;
}

/**
 * Tarjeta del catalogo. Memoizada porque la lista vuelve a renderizar al
 * cargar cada pagina y las tarjetas visibles no cambian.
 */
function TarjetaBase({ producto, ancho, onPress }: Props) {
  const enPromocion = promocionVigente(producto);

  return (
    <Pressable
      onPress={() => onPress(producto)}
      accessibilityRole="button"
      accessibilityLabel={producto.nombre}
      style={({ pressed }) => [estilos.tarjeta, sombra.s, { width: ancho }, pressed && estilos.presionada]}
    >
      <View>
        <ImagenProducto
          url={producto.imagen_url}
          claveReciclado={producto.id_producto}
          estilo={{ width: '100%', aspectRatio: 3 / 4 }}
          redondeo={0}
        />
        {enPromocion ? (
          <View style={estilos.descuento}>
            <InsigniaDescuento porcentaje={producto.descuento_pct} />
          </View>
        ) : null}
        {producto.tiene_recurso_ra ? (
          <View style={estilos.ra}>
            <Ionicons name="scan-outline" size={13} color={colores.blanco} />
            <Text style={estilos.raTexto}>Probador</Text>
          </View>
        ) : null}
      </View>

      <View style={estilos.cuerpo}>
        <Text style={estilos.categoria} numberOfLines={1}>
          {producto.categoria?.nombre ?? ''}
        </Text>
        <Text style={estilos.nombre} numberOfLines={2}>
          {producto.nombre}
        </Text>
        <Precio producto={producto} />
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  tarjeta: {
    backgroundColor: colores.blanco,
    borderRadius: radio.m,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colores.borde,
  },
  presionada: { opacity: 0.9 },
  descuento: { position: 'absolute', top: esp.s, left: esp.s },
  ra: {
    position: 'absolute',
    bottom: esp.s,
    right: esp.s,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(28,27,26,0.72)',
    paddingHorizontal: esp.s,
    paddingVertical: 3,
    borderRadius: radio.pill,
  },
  raTexto: { ...texto.menor, fontSize: 10, color: colores.blanco, fontWeight: '600' },
  cuerpo: { padding: esp.m, gap: 3 },
  categoria: { ...texto.etiqueta, textTransform: 'uppercase', fontSize: 10 },
  nombre: { ...texto.cuerpo, color: colores.tinta, fontWeight: '500', minHeight: 40 },
});

export const TarjetaProducto = memo(TarjetaBase);
