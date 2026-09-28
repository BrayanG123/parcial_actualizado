/**
 * Panel inferior (bottom sheet) construido sobre el Modal de React Native.
 * Se usa para filtros, selecciones y confirmaciones sin abrir otra pantalla.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colores, esp, radio, texto } from '../theme';

interface Props {
  visible: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  /** Acciones fijas al pie (por ejemplo, Aplicar filtros). */
  pie?: ReactNode;
  alturaMaxima?: `${number}%`;
}

export function Hoja({ visible, titulo, onCerrar, children, pie, alturaMaxima = '85%' }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCerrar} statusBarTranslucent>
      <View style={estilos.fondo}>
        <Pressable style={estilos.zonaCierre} onPress={onCerrar} accessibilityLabel="Cerrar" />
        <View style={[estilos.panel, { maxHeight: alturaMaxima, paddingBottom: insets.bottom + esp.m }]}>
          <View style={estilos.asa} />
          <View style={estilos.encabezado}>
            <Text style={estilos.titulo}>{titulo}</Text>
            <Pressable onPress={onCerrar} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Ionicons name="close" size={22} color={colores.tinta2} />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={estilos.contenido}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {pie ? <View style={estilos.pie}>{pie}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.overlay, justifyContent: 'flex-end' },
  zonaCierre: { flex: 1 },
  panel: {
    backgroundColor: colores.crema,
    borderTopLeftRadius: radio.l,
    borderTopRightRadius: radio.l,
    paddingHorizontal: esp.l,
  },
  asa: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colores.bordeFuerte,
    alignSelf: 'center',
    marginTop: esp.s,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: esp.m,
  },
  titulo: { ...texto.titulo, fontSize: 18 },
  contenido: { paddingBottom: esp.m, gap: esp.l },
  pie: { paddingTop: esp.m, borderTopWidth: 1, borderTopColor: colores.borde },
});
