/**
 * F17 (igual que la web): al entrar a la tienda el cliente elige su sucursal. Desde ahi ve solo
 * las prendas de esa sucursal y compra o reserva sin volver a elegirla. Se puede cambiar
 * cuando quiera desde Inicio o Perfil.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Cargando, ErrorVista, Vacio } from '../../components/Estados';
import { Pantalla } from '../../components/Pantalla';
import { useSucursales } from '../../hooks/useCatalogo';
import { useEmpresaActiva } from '../../hooks/useEmpresa';
import { fijarSucursalTienda, useSucursalTienda } from '../../lib/sucursal-tienda';
import { colores, esp, radio, texto } from '../../theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../navigation/tipos';

export function PantallaSucursal({ alElegir }: { alElegir?: () => void }) {
  const navegacion = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const sucursales = useSucursales();
  const actual = useSucursalTienda();
  const empresa = useEmpresaActiva();
  const activas = (sucursales.data ?? []).filter((s) => s.activa !== false);

  return (
    <Pantalla bordes={alElegir ? [] : ['top']}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Text style={estilos.tienda}>{empresa?.nombre ?? empresa?.slug ?? ''}</Text>
        <Text style={texto.display}>{actual ? 'Cambiar de sucursal' : 'Elige tu sucursal'}</Text>
        <Text style={texto.cuerpo}>
          Veras las prendas disponibles en la sucursal que elijas. Ahi retiras tus compras y te pruebas
          tus reservas.
        </Text>
        {sucursales.isLoading ? <Cargando mensaje="Cargando sucursales..." /> : null}
        {sucursales.isError ? (
          <ErrorVista error={sucursales.error} onReintentar={() => void sucursales.refetch()} />
        ) : null}
        {sucursales.isSuccess && activas.length === 0 ? (
          <Vacio titulo="Sin sucursales abiertas" detalle="Esta tienda aun no tiene sucursales atendiendo." />
        ) : null}
        {activas.map((s) => {
          const elegida = actual?.id_sucursal === s.id_sucursal;
          return (
            <Pressable
              key={s.id_sucursal}
              accessibilityRole="button"
              accessibilityLabel={`Comprar en ${s.nombre}`}
              onPress={() => {
                fijarSucursalTienda({ id_sucursal: s.id_sucursal, nombre: s.nombre, ciudad: s.ciudad });
                alElegir?.();
              }}
              style={({ pressed }) => [estilos.tarjeta, elegida && estilos.activa, pressed && { opacity: 0.85 }]}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={texto.subtitulo}>{s.nombre}</Text>
                <Text style={texto.menor}>{s.ciudad}</Text>
                {s.direccion ? <Text style={texto.menor}>{s.direccion}</Text> : null}
              </View>
              <Text style={estilos.accion}>{elegida ? 'Actual' : 'Comprar aqui'}</Text>
              <Ionicons name="chevron-forward" size={18} color={colores.acento} />
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => navegacion.navigate('Tiendas')} style={estilos.otraTienda}>
          <Text style={estilos.enlace}>Cambiar de tienda</Text>
        </Pressable>
      </ScrollView>
    </Pantalla>
  );
}

/** Pantalla inicial del cliente mientras no haya sucursal elegida. */
export function PantallaElegirSucursal() {
  return <PantallaSucursal />;
}

/** "Cambiar de sucursal": vuelve a la pantalla anterior tras elegir. */
export function PantallaCambiarSucursal() {
  const navegacion = useNavigation();
  return <PantallaSucursal alElegir={() => navegacion.canGoBack() && navegacion.goBack()} />;
}

const estilos = StyleSheet.create({
  contenido: { padding: esp.xl, gap: esp.m, paddingBottom: esp.xxxl },
  tienda: { ...texto.menor, textTransform: 'uppercase', letterSpacing: 1 },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: esp.s,
    padding: esp.l,
    borderRadius: radio.m,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.blanco,
  },
  activa: { borderColor: colores.acento, borderWidth: 2 },
  otraTienda: { alignItems: 'center', paddingVertical: esp.l },
  enlace: { ...texto.cuerpo, color: colores.acento, fontWeight: '600' },
  accion: { ...texto.menor, color: colores.acento, fontWeight: '600' },
});
