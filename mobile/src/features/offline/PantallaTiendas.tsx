import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import type { PropsStack } from '../../navigation/tipos';
import { esp, texto } from '../../theme';
import { SelectorTienda } from '../tienda/SelectorTienda';

/** F6.4: cambiar de tienda (empresa) desde el perfil o el acceso; se envia como X-Tenant. */
export function PantallaTiendas({ navigation }: PropsStack<'Tiendas'>) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: esp.l, gap: esp.m }} keyboardShouldPersistTaps="handled">
        <Text style={texto.cuerpo}>Cada tienda tiene su propio catalogo, sucursales y cuentas.</Text>
        <SelectorTienda onElegida={() => navigation.goBack()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
