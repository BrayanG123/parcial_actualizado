/**
 * Imagen de producto con cache en disco y silueta de respaldo.
 *
 * Se usa expo-image (no la Image de React Native) porque cachea en memoria y
 * disco, recicla vistas dentro de las listas y evita el parpadeo al desplazar.
 */
import { memo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colores, radio } from '../theme';

interface Props {
  url?: string | null;
  /** Identidad de la imagen dentro de una lista reciclada. */
  claveReciclado?: string | number;
  estilo?: StyleProp<ViewStyle>;
  redondeo?: number;
  tamanoIcono?: number;
}

function ImagenProductoBase({
  url,
  claveReciclado,
  estilo,
  redondeo = radio.m,
  tamanoIcono = 30,
}: Props) {
  const [fallo, setFallo] = useState(false);
  const sinImagen = !url || fallo;

  return (
    <View style={[estilos.contenedor, { borderRadius: redondeo }, estilo]}>
      {sinImagen ? (
        <View style={estilos.respaldo}>
          <Ionicons name="shirt-outline" size={tamanoIcono} color={colores.bordeFuerte} />
        </View>
      ) : (
        <Image
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
          cachePolicy="memory-disk"
          recyclingKey={claveReciclado != null ? String(claveReciclado) : undefined}
          onError={() => setFallo(true)}
        />
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { backgroundColor: colores.crema2, overflow: 'hidden' },
  respaldo: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export const ImagenProducto = memo(ImagenProductoBase);
