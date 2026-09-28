/**
 * Estado para las pantallas que solo tienen sentido con sesion iniciada.
 * Es experiencia de usuario, no seguridad: el backend valida cada peticion.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores, esp, texto } from '../theme';
import { Boton } from './Boton';

interface Props {
  titulo: string;
  detalle: string;
  onAcceder: () => void;
}

export function RequiereSesion({ titulo, detalle, onAcceder }: Props) {
  return (
    <View style={estilos.centro}>
      <View style={estilos.circulo}>
        <Ionicons name="person-outline" size={26} color={colores.acento} />
      </View>
      <Text style={estilos.titulo}>{titulo}</Text>
      <Text style={estilos.detalle}>{detalle}</Text>
      <Boton titulo="Iniciar sesion" onPress={onAcceder} estilo={estilos.boton} />
    </View>
  );
}

const estilos = StyleSheet.create({
  centro: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: esp.xl,
    gap: esp.s,
  },
  circulo: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colores.acentoSuave,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: esp.xs,
  },
  titulo: { ...texto.titulo, textAlign: 'center' },
  detalle: { ...texto.cuerpo, textAlign: 'center', color: colores.tinta3 },
  boton: { marginTop: esp.m, minWidth: 200 },
});
