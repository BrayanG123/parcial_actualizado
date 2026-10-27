import { useEffect, useRef, useState } from 'react';
import { useSesion } from '../context/SesionContext';
import { usePush } from '../context/PushContext';
/**
 * Navegacion de la aplicacion.
 *
 *   Tabs (Inicio, Catalogo, Carrito, Reservas, Perfil)
 *     -> Producto -> Probador / NuevaReserva
 *     -> Checkout
 *     -> Compras -> DetalleCompra
 *     -> DetalleReserva
 *     -> Asistente, Acceso (modales)
 *
 * Las pantallas que exigen sesion no se ocultan: muestran un estado que invita
 * a entrar. Asi el catalogo sigue siendo publico, igual que en la web.
 */
import { NavigationContainer, useNavigationContainerRef, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PantallaProducto } from '../features/product/PantallaProducto';
import { PantallaProbador } from '../features/ar/PantallaProbador';
import { PantallaCheckout } from '../features/checkout/PantallaCheckout';
import { PantallaNuevaReserva } from '../features/reservations/PantallaNuevaReserva';
import { PantallaDetalleReserva } from '../features/reservations/PantallaDetalleReserva';
import { PantallaCompras } from '../features/history/PantallaCompras';
import { PantallaDetalleCompra } from '../features/history/PantallaDetalleCompra';
import { PantallaAsistente } from '../features/ia/PantallaAsistente';
import { PantallaAcceso } from '../features/auth/PantallaAcceso';
import { colores, fuentes } from '../theme';
import type { RootStackParamList } from './tipos';
import { Tabs } from './Tabs';
import { TabsVendedor } from './TabsVendedor';
import { PantallaTiendas } from '../features/offline/PantallaTiendas';
import { PantallaTiendaOffline } from '../features/offline/PantallaTiendaOffline';
import { PantallaPendientes } from '../features/offline/PantallaPendientes';
import { RolNombre } from '../types/domain';

/** Personal que vende en tienda: la app abre el modo vendedor (F6.6). */
const ROLES_VENDEDOR: string[] = [RolNombre.CAJERO, RolNombre.ENCARGADO_SUCURSAL, RolNombre.ADMINISTRADOR];

const Stack = createNativeStackNavigator<RootStackParamList>();

const tema: Theme = {
  dark: false,
  colors: {
    primary: colores.acento,
    background: colores.crema,
    card: colores.blanco,
    text: colores.tinta,
    border: colores.borde,
    notification: colores.acento,
  },
  fonts: {
    regular: { fontFamily: fuentes.texto, fontWeight: '400' },
    medium: { fontFamily: fuentes.texto, fontWeight: '500' },
    bold: { fontFamily: fuentes.texto, fontWeight: '700' },
    heavy: { fontFamily: fuentes.titulo, fontWeight: '700' },
  },
};

export function Navegacion() {
  const ref = useNavigationContainerRef<RootStackParamList>();
  const [lista, setLista] = useState(false);
  const { usuario, restaurando } = useSesion();
  const vendedor = Boolean(usuario?.roles.some((r) => ROLES_VENDEDOR.includes(String(r.nombre))));
  const { pendiente, consumir } = usePush();
  const accesoPedido = useRef<string | null>(null);
  useEffect(() => {
    if (!lista || restaurando || !pendiente) return;
    if (!usuario) {
      if (accesoPedido.current !== pendiente.eventId) {
        accesoPedido.current = pendiente.eventId;
        ref.navigate('Acceso', { motivo: 'Inicia sesion para consultar tu notificacion.' });
      }
      return;
    }
    // No abrir compras de la cuenta anterior si se cambio de usuario.
    if (pendiente.userId === usuario.id_usuario) {
      ref.navigate(pendiente.pantalla, { id: pendiente.id });
    }
    accesoPedido.current = null;
    consumir();
  }, [lista, restaurando, usuario, pendiente, consumir, ref]);
  return (
    <NavigationContainer ref={ref} onReady={() => setLista(true)} theme={tema}>
      <Stack.Navigator
        screenOptions={{
          headerTitleStyle: { fontFamily: fuentes.texto, fontSize: 17, fontWeight: '600' },
          headerTintColor: colores.tinta,
          headerStyle: { backgroundColor: colores.blanco },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colores.crema },
        }}
      >
        <Stack.Screen name="Tabs" component={vendedor ? TabsVendedor : Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Tiendas" component={PantallaTiendas} options={{ title: 'Elegir tienda' }} />
        <Stack.Screen name="TiendaOffline" component={PantallaTiendaOffline} options={{ title: 'Tienda sin conexion' }} />
        <Stack.Screen name="Pendientes" component={PantallaPendientes} options={{ title: 'Pendientes' }} />
        <Stack.Screen name="Producto" component={PantallaProducto} options={{ title: 'Producto' }} />
        <Stack.Screen name="Probador" component={PantallaProbador} options={{ title: 'Probador virtual' }} />
        <Stack.Screen name="Checkout" component={PantallaCheckout} options={{ title: 'Finalizar compra' }} />
        <Stack.Screen name="NuevaReserva" component={PantallaNuevaReserva} options={{ title: 'Nueva reserva' }} />
        <Stack.Screen name="DetalleReserva" component={PantallaDetalleReserva} options={{ title: 'Reserva' }} />
        <Stack.Screen name="Compras" component={PantallaCompras} options={{ title: 'Mis compras' }} />
        <Stack.Screen name="DetalleCompra" component={PantallaDetalleCompra} options={{ title: 'Detalle de compra' }} />
        <Stack.Screen
          name="Asistente"
          component={PantallaAsistente}
          options={{ title: 'Asistente de estilo', presentation: 'modal' }}
        />
        <Stack.Screen
          name="Acceso"
          component={PantallaAcceso}
          options={{ headerShown: false, presentation: 'modal' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
