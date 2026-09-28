import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colores, esp, texto } from '../theme';

interface Props {
  children: ReactNode;
  /** Bordes seguros a respetar; el tab bar ya cubre el inferior. */
  bordes?: Edge[];
  estilo?: StyleProp<ViewStyle>;
  fondo?: string;
}

export function Pantalla({ children, bordes = ['top'], estilo, fondo = colores.crema }: Props) {
  return (
    <SafeAreaView edges={bordes} style={[estilos.base, { backgroundColor: fondo }, estilo]}>
      {children}
    </SafeAreaView>
  );
}

/** Encabezado de seccion dentro de una pantalla con scroll. */
export function TituloSeccion({
  titulo,
  detalle,
  accion,
}: {
  titulo: string;
  detalle?: string;
  accion?: ReactNode;
}) {
  return (
    <View style={estilos.seccion}>
      <View style={estilos.seccionTextos}>
        <Text style={estilos.seccionTitulo}>{titulo}</Text>
        {detalle ? <Text style={estilos.seccionDetalle}>{detalle}</Text> : null}
      </View>
      {accion}
    </View>
  );
}

const estilos = StyleSheet.create({
  base: { flex: 1 },
  seccion: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: esp.m,
    marginBottom: esp.m,
  },
  seccionTextos: { flex: 1, gap: 2 },
  seccionTitulo: { ...texto.titulo },
  seccionDetalle: { ...texto.menor },
});
