/**
 * Selectores compactos: chips de filtro, tallas, colores y contador de
 * cantidad. Todos marcan visualmente lo que no esta disponible en lugar de
 * ocultarlo, para que el cliente entienda por que no puede elegirlo.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colores, esp, radio, texto } from '../theme';

interface PropsChip {
  texto: string;
  activo?: boolean;
  deshabilitado?: boolean;
  onPress: () => void;
}

function ChipBase({ texto: contenido, activo = false, deshabilitado = false, onPress }: PropsChip) {
  return (
    <Pressable
      onPress={onPress}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityState={{ selected: activo, disabled: deshabilitado }}
      style={({ pressed }) => [
        estilos.chip,
        activo && estilos.chipActivo,
        deshabilitado && estilos.chipInactivo,
        pressed && !deshabilitado && estilos.presionado,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          estilos.chipTexto,
          activo && estilos.chipTextoActivo,
          deshabilitado && estilos.chipTextoInactivo,
        ]}
      >
        {contenido}
      </Text>
    </Pressable>
  );
}

export const Chip = memo(ChipBase);

interface PropsTalla {
  nombre: string;
  activo: boolean;
  agotada: boolean;
  onPress: () => void;
}

function TallaBase({ nombre, activo, agotada, onPress }: PropsTalla) {
  return (
    <Pressable
      onPress={onPress}
      disabled={agotada}
      accessibilityRole="button"
      accessibilityLabel={agotada ? `Talla ${nombre}, sin stock` : `Talla ${nombre}`}
      accessibilityState={{ selected: activo, disabled: agotada }}
      style={[estilos.talla, activo && estilos.tallaActiva, agotada && estilos.tallaAgotada]}
    >
      <Text style={[estilos.tallaTexto, activo && estilos.tallaTextoActivo, agotada && estilos.tallaTextoAgotado]}>
        {nombre}
      </Text>
    </Pressable>
  );
}

export const SelectorTalla = memo(TallaBase);

interface PropsColor {
  hex: string;
  nombre: string;
  activo: boolean;
  agotado: boolean;
  onPress: () => void;
}

function ColorBase({ hex, nombre, activo, agotado, onPress }: PropsColor) {
  return (
    <Pressable
      onPress={onPress}
      disabled={agotado}
      accessibilityRole="button"
      accessibilityLabel={agotado ? `Color ${nombre}, sin stock` : `Color ${nombre}`}
      accessibilityState={{ selected: activo, disabled: agotado }}
      style={[estilos.colorAro, activo && estilos.colorAroActivo, agotado && estilos.colorAgotado]}
    >
      <View style={[estilos.colorMuestra, { backgroundColor: hex }]}>
        {agotado ? <View style={estilos.colorTachado} /> : null}
      </View>
    </Pressable>
  );
}

export const SelectorColor = memo(ColorBase);

interface PropsContador {
  valor: number;
  min?: number;
  max?: number;
  onCambiar: (valor: number) => void;
  compacto?: boolean;
}

export function Contador({ valor, min = 1, max = 99, onCambiar, compacto = false }: PropsContador) {
  const tamano = compacto ? 30 : 36;
  return (
    <View style={estilos.contador}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quitar una unidad"
        hitSlop={6}
        disabled={valor <= min}
        onPress={() => onCambiar(valor - 1)}
        style={[estilos.contadorBoton, { width: tamano, height: tamano }, valor <= min && estilos.inactivo]}
      >
        <Ionicons name="remove" size={16} color={colores.tinta} />
      </Pressable>
      <Text style={estilos.contadorValor}>{valor}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agregar una unidad"
        hitSlop={6}
        disabled={valor >= max}
        onPress={() => onCambiar(valor + 1)}
        style={[estilos.contadorBoton, { width: tamano, height: tamano }, valor >= max && estilos.inactivo]}
      >
        <Ionicons name="add" size={16} color={colores.tinta} />
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  chip: {
    paddingHorizontal: esp.m,
    paddingVertical: 7,
    borderRadius: radio.pill,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.blanco,
  },
  chipActivo: { backgroundColor: colores.tinta, borderColor: colores.tinta },
  chipInactivo: { opacity: 0.45 },
  chipTexto: { ...texto.cuerpo, fontSize: 13, color: colores.tinta2 },
  chipTextoActivo: { color: colores.blanco, fontWeight: '600' },
  chipTextoInactivo: { color: colores.tinta3 },
  presionado: { opacity: 0.7 },

  talla: {
    minWidth: 46,
    paddingHorizontal: esp.m,
    paddingVertical: 9,
    borderRadius: radio.s,
    borderWidth: 1,
    borderColor: colores.bordeFuerte,
    backgroundColor: colores.blanco,
    alignItems: 'center',
  },
  tallaActiva: { backgroundColor: colores.tinta, borderColor: colores.tinta },
  tallaAgotada: { backgroundColor: colores.crema2, borderColor: colores.borde },
  tallaTexto: { ...texto.cuerpo, fontWeight: '600', color: colores.tinta },
  tallaTextoActivo: { color: colores.blanco },
  tallaTextoAgotado: { color: colores.tinta3, textDecorationLine: 'line-through' },

  colorAro: {
    padding: 3,
    borderRadius: radio.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorAroActivo: { borderColor: colores.tinta },
  colorAgotado: { opacity: 0.4 },
  colorMuestra: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colores.borde,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  colorTachado: {
    position: 'absolute',
    width: 38,
    height: 1.5,
    backgroundColor: colores.blanco,
    transform: [{ rotate: '45deg' }],
  },

  contador: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.pill,
    backgroundColor: colores.blanco,
    paddingHorizontal: 2,
  },
  contadorBoton: { alignItems: 'center', justifyContent: 'center' },
  contadorValor: { ...texto.cuerpo, minWidth: 26, textAlign: 'center', fontWeight: '600', color: colores.tinta },
  inactivo: { opacity: 0.3 },
});
