import { memo } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores, esp, radio, texto } from '../theme';

type Variante = 'primario' | 'secundario' | 'plano' | 'peligro';
type Tamano = 'normal' | 'compacto';

interface Props {
  titulo: string;
  onPress: () => void;
  variante?: Variante;
  tamano?: Tamano;
  icono?: keyof typeof Ionicons.glyphMap;
  cargando?: boolean;
  deshabilitado?: boolean;
  ancho?: boolean;
  estilo?: StyleProp<ViewStyle>;
}

/**
 * Boton unico de la aplicacion. Mientras `cargando` es true queda
 * deshabilitado, lo que evita el doble envio en los formularios.
 */
function BotonBase({
  titulo,
  onPress,
  variante = 'primario',
  tamano = 'normal',
  icono,
  cargando = false,
  deshabilitado = false,
  ancho = false,
  estilo,
}: Props) {
  const inactivo = deshabilitado || cargando;
  const paleta = PALETAS[variante];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      onPress={onPress}
      disabled={inactivo}
      style={({ pressed }) => [
        estilos.base,
        tamano === 'compacto' ? estilos.compacto : estilos.normal,
        { backgroundColor: paleta.fondo, borderColor: paleta.borde },
        ancho && estilos.ancho,
        pressed && !inactivo && estilos.presionado,
        inactivo && estilos.inactivo,
        estilo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator size="small" color={paleta.texto} />
      ) : (
        <View style={estilos.contenido}>
          {icono ? <Ionicons name={icono} size={tamano === 'compacto' ? 15 : 17} color={paleta.texto} /> : null}
          <Text
            numberOfLines={1}
            style={[
              estilos.titulo,
              { color: paleta.texto, fontSize: tamano === 'compacto' ? 13 : 15 },
            ]}
          >
            {titulo}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const PALETAS: Record<Variante, { fondo: string; borde: string; texto: string }> = {
  primario: { fondo: colores.acento, borde: colores.acento, texto: colores.blanco },
  secundario: { fondo: colores.blanco, borde: colores.bordeFuerte, texto: colores.tinta },
  plano: { fondo: 'transparent', borde: 'transparent', texto: colores.acento },
  peligro: { fondo: colores.errorSuave, borde: colores.errorSuave, texto: colores.error },
};

const estilos = StyleSheet.create({
  base: {
    borderRadius: radio.m,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  normal: { paddingVertical: 13, paddingHorizontal: esp.l, minHeight: 48 },
  compacto: { paddingVertical: 8, paddingHorizontal: esp.m, minHeight: 36 },
  ancho: { alignSelf: 'stretch' },
  contenido: { flexDirection: 'row', alignItems: 'center', gap: esp.s },
  titulo: { ...texto.subtitulo, fontWeight: '600' },
  presionado: { opacity: 0.85 },
  inactivo: { opacity: 0.5 },
});

export const Boton = memo(BotonBase);
