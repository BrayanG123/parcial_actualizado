/**
 * Estados compartidos por todas las pantallas: cargando, vacio y error.
 * Ninguna vista debe quedar en blanco ante un fallo.
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores, esp, radio, texto } from '../theme';
import { Boton } from './Boton';

export function Cargando({ mensaje = 'Cargando...' }: { mensaje?: string }) {
  return (
    <View style={estilos.centro}>
      <ActivityIndicator color={colores.acento} />
      <Text style={estilos.mensaje}>{mensaje}</Text>
    </View>
  );
}

interface PropsVacio {
  icono?: keyof typeof Ionicons.glyphMap;
  titulo: string;
  detalle?: string;
  accion?: { titulo: string; onPress: () => void };
}

export function Vacio({ icono = 'shirt-outline', titulo, detalle, accion }: PropsVacio) {
  return (
    <View style={estilos.centro}>
      <View style={estilos.circulo}>
        <Ionicons name={icono} size={26} color={colores.tinta3} />
      </View>
      <Text style={estilos.titulo}>{titulo}</Text>
      {detalle ? <Text style={estilos.mensaje}>{detalle}</Text> : null}
      {accion ? (
        <Boton
          titulo={accion.titulo}
          onPress={accion.onPress}
          variante="secundario"
          tamano="compacto"
          estilo={estilos.accion}
        />
      ) : null}
    </View>
  );
}

interface PropsError {
  error: unknown;
  onReintentar?: () => void;
}

export function ErrorVista({ error, onReintentar }: PropsError) {
  const mensaje =
    error instanceof Error && error.message ? error.message : 'No pudimos cargar la informacion.';
  return (
    <View style={estilos.centro}>
      <View style={[estilos.circulo, { backgroundColor: colores.errorSuave }]}>
        <Ionicons name="alert-circle-outline" size={26} color={colores.error} />
      </View>
      <Text style={estilos.titulo}>Algo no salio bien</Text>
      <Text style={estilos.mensaje}>{mensaje}</Text>
      {onReintentar ? (
        <Boton
          titulo="Reintentar"
          icono="refresh"
          onPress={onReintentar}
          variante="secundario"
          tamano="compacto"
          estilo={estilos.accion}
        />
      ) : null}
    </View>
  );
}

/** Aviso en linea para errores dentro de un formulario o una tarjeta. */
export function AvisoEnLinea({ texto: contenido, tipo = 'error' }: { texto: string; tipo?: 'error' | 'info' }) {
  const fondo = tipo === 'error' ? colores.errorSuave : colores.infoSuave;
  const color = tipo === 'error' ? colores.error : colores.info;
  return (
    <View style={[estilos.enLinea, { backgroundColor: fondo }]}>
      <Ionicons
        name={tipo === 'error' ? 'alert-circle' : 'information-circle'}
        size={16}
        color={color}
      />
      <Text style={[estilos.enLineaTexto, { color }]}>{contenido}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: esp.xxl,
    paddingHorizontal: esp.xl,
    gap: esp.s,
  },
  circulo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colores.crema2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: esp.xs,
  },
  titulo: { ...texto.subtitulo, textAlign: 'center' },
  mensaje: { ...texto.cuerpo, textAlign: 'center', color: colores.tinta3 },
  accion: { marginTop: esp.m },
  enLinea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.s,
    padding: esp.m,
    borderRadius: radio.s,
  },
  enLineaTexto: { ...texto.cuerpo, flex: 1 },
});
