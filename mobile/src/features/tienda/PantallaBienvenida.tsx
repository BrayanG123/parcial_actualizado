/**
 * Primer arranque: la app pertenece a una plataforma SaaS con varias tiendas, asi que no abre
 * ninguna por defecto. Se elige la tienda (codigo o directorio) y recien ahi aparece su catalogo
 * o, para el personal, el modo vendedor tras iniciar sesion.
 */
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { Pantalla } from '../../components/Pantalla';
import { colores, esp, texto } from '../../theme';
import { SelectorTienda } from './SelectorTienda';

/** Web de la plataforma (alta de empresas). Opcional: sin ella no se muestra el enlace. */
const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/+$/, '');

export function PantallaBienvenida() {
  return (
    <Pantalla bordes={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          <Text style={estilos.marca}>
            Fashion<Text style={{ color: colores.acento }}>Store</Text>
          </Text>
          <Text style={estilos.subtitulo}>Plataforma para tiendas de ropa</Text>
          <Text style={texto.cuerpo}>
            Elige la tienda donde quieres comprar o trabajar. Clientes, cajeros y encargados entran con
            el codigo de su tienda.
          </Text>

          <SelectorTienda />

          {WEB_URL ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void Linking.openURL(`${WEB_URL}/registro-empresa`)}
              style={estilos.registro}
            >
              <Text style={texto.cuerpo}>
                Tienes una tienda de ropa? <Text style={estilos.enlace}>Registrala en la web</Text>
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Pantalla>
  );
}

const estilos = StyleSheet.create({
  contenido: { padding: esp.xl, gap: esp.l, paddingTop: esp.xxxl },
  marca: { ...texto.display, fontSize: 34, lineHeight: 40 },
  subtitulo: { ...texto.subtitulo, color: colores.tinta2, marginTop: -esp.s },
  registro: { alignItems: 'center', paddingVertical: esp.l },
  enlace: { color: colores.acento, fontWeight: '600' },
});
