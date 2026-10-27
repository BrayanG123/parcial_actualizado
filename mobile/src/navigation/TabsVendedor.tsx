import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Alert, ScrollView, Text } from 'react-native';
import { useEmpresaActiva } from '../hooks/useEmpresa';
import { Boton } from '../components/Boton';
import { Pantalla } from '../components/Pantalla';
import { useSesion } from '../context/SesionContext';
import { PantallaPendientes } from '../features/offline/PantallaPendientes';
import { PantallaVender } from '../features/offline/PantallaVender';
import { useAlcanceOffline, useDatosOffline } from '../hooks/useOffline';
import { colores, esp, fuentes, texto } from '../theme';
import type { TabsVendedorParamList } from './tipos';

const Tab = createBottomTabNavigator<TabsVendedorParamList>();

function PerfilVendedor() {
  const { usuario, sesionOffline, cerrarSesion } = useSesion();
  const alcance = useAlcanceOffline();
  const { pendientes } = useDatosOffline(alcance);
  const empresa = useEmpresaActiva();
  return (
    <Pantalla>
      <ScrollView contentContainerStyle={{ padding: esp.l, gap: esp.m }}>
        <Text style={texto.titulo}>{usuario?.nombre}</Text>
        <Text style={texto.cuerpo}>{usuario?.roles.map((r) => String(r.nombre).toLowerCase()).join(', ')}</Text>
        <Text style={texto.cuerpo}>Tienda: {empresa?.nombre ?? empresa?.slug ?? 'FashionStore'}</Text>
        {sesionOffline && <Text style={texto.cuerpo}>Sesion sin conexion: solo venta offline y pendientes.</Text>}
        <Boton
          titulo="Cerrar sesion"
          variante="peligro"
          icono="log-out-outline"
          ancho
          onPress={() =>
            pendientes.length
              ? Alert.alert(
                  'Hay operaciones pendientes',
                  'Quedan guardadas en el telefono y se enviaran al volver a iniciar sesion con esta cuenta.',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Cerrar sesion', style: 'destructive', onPress: () => void cerrarSesion() },
                  ],
                )
              : void cerrarSesion()
          }
        />
      </ScrollView>
    </Pantalla>
  );
}

/** Modo vendedor (F6.6): POS offline, pendientes y cuenta. */
export function TabsVendedor() {
  const alcance = useAlcanceOffline();
  const { pendientes } = useDatosOffline(alcance);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colores.acento,
        tabBarInactiveTintColor: colores.tinta3,
        tabBarLabelStyle: { fontFamily: fuentes.texto, fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Vender"
        component={PantallaVender}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="cash-outline" size={size - 2} color={color} /> }}
      />
      <Tab.Screen
        name="PendientesVendedor"
        component={PantallaPendientes}
        options={{
          title: 'Pendientes',
          tabBarBadge: pendientes.length || undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="sync-outline" size={size - 2} color={color} />,
        }}
      />
      <Tab.Screen
        name="PerfilVendedor"
        component={PerfilVendedor}
        options={{ title: 'Cuenta', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size - 2} color={color} /> }}
      />
    </Tab.Navigator>
  );
}
