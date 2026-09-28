import { Linking, StyleSheet, Text, View } from 'react-native';
import { Boton } from '../../components/Boton';
import { usePush } from '../../context/PushContext';
import { colores, esp, radio, texto } from '../../theme';

export function AvisosPush() {
  const { disponible, estado, mensaje, activar } = usePush();
  if (!disponible) return null;
  return <View style={estilos.tarjeta}>
    <Text style={estilos.titulo}>Notificaciones</Text>
    <Text style={estilos.detalle}>{mensaje}</Text>
    <Boton
      titulo={estado === 'activo' || estado === 'bloqueado' ? 'Configurar permisos' : 'Activar avisos'}
      icono="notifications-outline" variante="secundario" cargando={estado === 'activando'}
      onPress={() => {
        if (estado === 'activo' || estado === 'bloqueado') void Linking.openSettings().catch(() => undefined);
        else void activar();
      }}
    />
  </View>;
}
const estilos = StyleSheet.create({
  tarjeta: { padding: esp.l, gap: esp.m, backgroundColor: colores.blanco, borderRadius: radio.l },
  titulo: { ...texto.subtitulo },
  detalle: { ...texto.cuerpo, color: colores.tinta3 },
});
