import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { PantallaInicio } from '../features/catalog/PantallaInicio';
import { PantallaCatalogo } from '../features/catalog/PantallaCatalogo';
import { PantallaCarrito } from '../features/cart/PantallaCarrito';
import { PantallaReservas } from '../features/reservations/PantallaReservas';
import { PantallaPerfil } from '../features/profile/PantallaPerfil';
import { useCarrito } from '../hooks/useComercio';
import { colores, fuentes } from '../theme';
import type { TabsParamList } from './tipos';

const Tab = createBottomTabNavigator<TabsParamList>();

const ICONOS: Record<keyof TabsParamList, { activo: keyof typeof Ionicons.glyphMap; inactivo: keyof typeof Ionicons.glyphMap }> = {
  Inicio: { activo: 'home', inactivo: 'home-outline' },
  Catalogo: { activo: 'grid', inactivo: 'grid-outline' },
  Carrito: { activo: 'bag', inactivo: 'bag-outline' },
  Reservas: { activo: 'calendar', inactivo: 'calendar-outline' },
  Perfil: { activo: 'person', inactivo: 'person-outline' },
};

export function Tabs() {
  const carrito = useCarrito();
  const unidades = carrito.data?.detalles.reduce((acc, d) => acc + d.cantidad, 0) ?? 0;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colores.acento,
        tabBarInactiveTintColor: colores.tinta3,
        tabBarStyle: { backgroundColor: colores.blanco, borderTopColor: colores.borde },
        tabBarLabelStyle: { fontFamily: fuentes.texto, fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => (
          <Ionicons
            name={focused ? ICONOS[route.name].activo : ICONOS[route.name].inactivo}
            size={size - 2}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen name="Inicio" component={PantallaInicio} />
      <Tab.Screen name="Catalogo" component={PantallaCatalogo} options={{ title: 'Catalogo' }} />
      <Tab.Screen
        name="Carrito"
        component={PantallaCarrito}
        options={{ tabBarBadge: unidades > 0 ? unidades : undefined }}
      />
      <Tab.Screen name="Reservas" component={PantallaReservas} />
      <Tab.Screen name="Perfil" component={PantallaPerfil} />
    </Tab.Navigator>
  );
}
